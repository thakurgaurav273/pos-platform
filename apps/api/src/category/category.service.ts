import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

export type CategoryProductSummary = {
  id: string;
  name: string;
  totalStock: number;
};

export type CategoryShopSummary = {
  id: string;
  name: string;
  createdAt: Date;
  products: CategoryProductSummary[];
  totalStock: number;
};

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Categories for this shop: products and stock rolled up from variants. */
  async findAllWithShopSummary(
    shopCode: string,
  ): Promise<CategoryShopSummary[]> {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        products: {
          where: { shopCode },
          include: {
            variants: { select: { quantity: true } },
          },
          orderBy: { name: 'asc' },
        },
      },
    });

    return categories.map((cat) => {
      const products: CategoryProductSummary[] = cat.products.map((p) => {
        const totalStock = p.variants.reduce(
          (s, v) => s + Number(v.quantity),
          0,
        );
        return { id: p.id, name: p.name, totalStock };
      });
      const totalStock = products.reduce((s, p) => s + p.totalStock, 0);
      return {
        id: cat.id,
        name: cat.name,
        createdAt: cat.createdAt,
        products,
        totalStock,
      };
    });
  }

  async findOneSummaryForShop(id: string, shopCode: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });
    if (!category) {
      throw new NotFoundException(`Category #${id} not found`);
    }
    const agg = await this.prisma.productVariant.aggregate({
      where: {
        product: {
          categoryId: id,
          shopCode,
        },
      },
      _sum: { quantity: true },
    });
    const totalStock = Number(agg._sum.quantity ?? 0);
    return { ...category, totalStock };
  }

  async findProductsPage(
    categoryId: string,
    shopCode: string,
    page: number,
    size: number,
    search = '',
  ) {
    await this.ensureCategoryExists(categoryId);

    const where: Prisma.ProductWhereInput = {
      categoryId,
      shopCode,
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };

    const total = await this.prisma.product.count({ where });
    const lastPage = Math.max(1, Math.ceil(total / size));
    const safePage = Math.min(Math.max(1, page), lastPage);

    const products = await this.prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (safePage - 1) * size,
      take: size,
      include: {
        variants: { orderBy: { createdAt: 'asc' } },
      },
    });

    return {
      data: products,
      last_page: lastPage,
      page: safePage,
      size,
      total,
    };
  }

  /** The unique index is case-sensitive, so "sweets" would otherwise sit beside "Sweets". */
  private async assertNameFree(
    name: string | undefined,
    exceptId?: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const trimmed = name?.trim();
    if (!trimmed) return;
    const clash = await db.category.findFirst({
      where: {
        name: { equals: trimmed, mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { name: true },
    });
    if (clash) {
      throw new ConflictException(
        `A category with the name "${clash.name}" already exists.`,
      );
    }
  }

  /** Pass `db` to create inside the caller's transaction (the catalog import does). */
  async create(
    createCategoryDto: CreateCategoryDto,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    await this.assertNameFree(createCategoryDto.name, undefined, db);
    try {
      return await db.category.create({ data: createCategoryDto });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          `A category with the name "${createCategoryDto.name}" already exists.`,
        );
      }
      throw e;
    }
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    await this.ensureCategoryExists(id);
    await this.assertNameFree(updateCategoryDto.name, id);
    try {
      return await this.prisma.category.update({
        where: { id },
        data: updateCategoryDto,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          `A category with the name "${updateCategoryDto.name}" already exists.`,
        );
      }
      throw e;
    }
  }

  async delete(id: string) {
    await this.ensureCategoryExists(id);
    await this.prisma.$transaction([
      this.prisma.product.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      }),
      this.prisma.category.delete({ where: { id } }),
    ]);
  }

  private async ensureCategoryExists(id: string) {
    const row = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException(`Category #${id} not found`);
    }
  }
}
