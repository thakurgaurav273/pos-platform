import { Injectable, HttpException, Logger } from '@nestjs/common';
import * as PaytmChecksum from 'paytmchecksum';
import axios from 'axios';
import { PrismaService } from '../prisma.service';
import { OrderSource, OrderStatus, PaymentMethod } from '@fluxen/database';
import { dec } from '../common/money';
import { applyStockChange, LONG_TX } from '../common/stock';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class PaymentService {
  private readonly mid: string;
  private readonly key: string;
  private readonly website: string;
  private readonly appUrl: string;
  private readonly isProd: boolean;
  private readonly logger = new Logger(PaymentService.name);

  constructor(private readonly prisma: PrismaService) {
    // Presence/length is enforced in production by validateEnv; placeholders only for local dev.
    this.mid = process.env.PAYTM_MID || 'YOUR_MID';
    this.key = process.env.PAYTM_MERCHANT_KEY || '16CharsLongKeyXX';
    this.website = process.env.PAYTM_WEBSITE || 'WEBSTAGING';
    this.appUrl = process.env.APP_URL || 'http://localhost:8080';
    this.isProd = process.env.NODE_ENV === 'production';

    if (this.key.length !== 16) {
      console.error(
        'CRITICAL: PAYTM_MERCHANT_KEY must be exactly 16 characters. ' +
          `Current length: ${this.key.length}. ` +
          'Please check your .env file.',
      );
    }
  }

  private get baseUrl() {
    return this.isProd
      ? 'https://securegw.paytm.in'
      : 'https://securegw-stage.paytm.in';
  }

  // STEP A: Initiate - call before showing the payment modal.
  // The amount is always the stored order total, never a client-supplied value.
  async initiatePayment(orderId: string, custId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        orderSource: true,
        totalAmount: true,
        customerPhone: true,
      },
    });
    if (!order || order.orderSource !== OrderSource.WEBSITE) {
      throw new HttpException('Order not found', 404);
    }
    if (order.status !== OrderStatus.DRAFT) {
      throw new HttpException('Order is not awaiting payment', 400);
    }
    const amount = Number(order.totalAmount);
    custId = custId || order.customerPhone || orderId;
    const body = {
      requestType: 'Payment',
      mid: this.mid,
      websiteName: this.website,
      orderId,
      callbackUrl: `${this.appUrl}/api/payment/callback`,
      txnAmount: { value: amount.toFixed(2), currency: 'INR' },
      userInfo: { custId },
    };

    let signature: string;
    try {
      signature = await PaytmChecksum.generateSignature(
        JSON.stringify(body),
        this.key,
      );
    } catch (error) {
      console.error('Paytm Signature Generation Error:', error.message);
      throw new HttpException(
        'Payment encryption failed. This is usually due to an invalid PAYTM_MERCHANT_KEY length (must be 16 chars).',
        500,
      );
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/theia/api/v1/initiateTransaction` +
          `?mid=${this.mid}&orderId=${orderId}`,
        { head: { signature }, body },
      );

      if (response.data.body.resultInfo.resultCode !== '0000') {
        throw new HttpException(response.data.body.resultInfo.resultMsg, 400);
      }

      return {
        orderId,
        txnToken: response.data.body.txnToken,
        amount: amount.toFixed(2),
        mid: this.mid,
      };
    } catch (error) {
      console.error(
        'Paytm Initiate Error:',
        error.response?.data || error.message,
      );
      throw new HttpException(
        error.response?.data?.body?.resultInfo?.resultMsg ||
          'Payment initiation failed',
        400,
      );
    }
  }

  // STEP B: Handle callback - Paytm POSTs here after payment
  async handleCallback(callbackBody: Record<string, any>) {
    const { CHECKSUMHASH, ...params } = callbackBody;

    if (!CHECKSUMHASH) {
      throw new HttpException('Missing checksum hash', 400);
    }

    const isValid = await PaytmChecksum.verifySignature(
      params,
      this.key,
      CHECKSUMHASH,
    );
    if (!isValid) throw new HttpException('Invalid checksum', 400);

    return {
      orderId: params.ORDERID,
      status: params.STATUS, // TXN_SUCCESS | TXN_FAILURE | PENDING
      txnId: params.TXNID,
      amount: params.TXNAMOUNT,
    };
  }

  // STEP C: Verify - always double-check via API (never trust callback alone)
  async verifyPayment(orderId: string) {
    const body = { mid: this.mid, orderId };
    const signature = await PaytmChecksum.generateSignature(
      JSON.stringify(body),
      this.key,
    );

    const response = await axios.post(`${this.baseUrl}/v3/order/status`, {
      head: { signature },
      body,
    });

    return response.data.body;
  }

  /**
   * Confirms a website order after a successful callback. The paid amount must equal the
   * stored total (checked against Paytm's status API, not just the callback), and the
   * DRAFT → PAID flip is conditional so duplicate callbacks cannot double-deduct stock.
   * Returns true when the order is (now or already) paid.
   */
  async completeOrder(
    orderId: string,
    callbackAmount: string,
  ): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) {
      throw new HttpException('Order not found', 404);
    }
    if (order.status === OrderStatus.PAID) return true;
    if (order.status !== OrderStatus.DRAFT) {
      this.logger.error(
        `Payment for ${orderId} received while order is ${order.status}`,
      );
      return false;
    }

    let paidAmount = callbackAmount;
    if (process.env.PAYTM_SKIP_STATUS_VERIFY !== '1') {
      const status = await this.verifyPayment(orderId);
      if (status?.resultInfo?.resultStatus !== 'TXN_SUCCESS') {
        this.logger.error(`Paytm status for ${orderId} is not TXN_SUCCESS`);
        return false;
      }
      paidAmount = status.txnAmount;
    }
    if (!dec(paidAmount || 0).eq(order.totalAmount)) {
      this.logger.error(
        `Amount mismatch for ${orderId}: paid ${paidAmount}, order total ${order.totalAmount.toString()}`,
      );
      return false;
    }

    return this.prisma
      .$transaction(async (tx) => {
        const billNo = await OrdersService.allocateBillNo(tx, order.shopCode);
        const flipped = await tx.order.updateMany({
          where: { id: orderId, status: OrderStatus.DRAFT },
          data: {
            status: OrderStatus.PAID,
            paymentMethod: PaymentMethod.ONLINE,
            billNo,
          },
        });
        if (flipped.count !== 1) {
          // Another callback won the race; roll back the bill number we just took.
          throw new AlreadyProcessed();
        }
        for (const item of order.items) {
          if (!item.productVariantId) continue;
          // The customer has already paid, so this may run the balance negative
          // (shortage to fulfil) rather than fail.
          await applyStockChange(tx, {
            variantId: item.productVariantId,
            shopCode: order.shopCode,
            delta: dec(item.quantity).neg(),
            reason: 'WEB_SALE',
            refId: order.id,
            allowNegative: true,
          });
        }
        return true;
      }, LONG_TX)
      .catch((e: unknown) => {
        if (e instanceof AlreadyProcessed) return true;
        throw e;
      });
  }
}

class AlreadyProcessed extends Error {}
