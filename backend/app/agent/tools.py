"""Read-only tools the agent can call to answer store questions.

Deliberately scoped to public storefront data only — live (APPROVED)
products, categories, vendor storefronts, and active promo codes. Orders,
messages, and user accounts are never exposed here: this endpoint has no
per-caller auth context, so surfacing anything from those tables would leak
other customers' data. Add an authenticated order-lookup tool separately if
that's ever needed, gated on the caller's own session.
"""

import json
from typing import Optional

from langchain_core.tools import tool
from sqlalchemy import text

from app.db import async_session


@tool
async def search_products(
    query: Optional[str] = None,
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    in_stock_only: bool = False,
    limit: int = 10,
) -> str:
    """Search live marketplace products by keyword, category, and price range.

    Only returns products that are APPROVED and publicly listed. Use this
    first for any "what products / do you have / show me" style question.
    `category` matches either the category name or slug. Set `in_stock_only`
    to true when the user cares about availability. Returns up to `limit`
    (max 25) results as JSON.
    """
    limit = max(1, min(limit, 25))
    sql = text(
        """
        SELECT p."title", p."slug", p."price"::float AS price, p."stock",
               p."description", v."storeName" AS vendor, c."name" AS category
        FROM "Product" p
        JOIN "Vendor" v ON v.id = p."vendorId"
        JOIN "Category" c ON c.id = p."categoryId"
        WHERE p."status" = 'APPROVED'
          AND (CAST(:query AS text) IS NULL OR p."title" ILIKE :like OR p."description" ILIKE :like)
          AND (CAST(:category AS text) IS NULL OR c."slug" = :category OR c."name" ILIKE :category_like)
          AND (CAST(:min_price AS float8) IS NULL OR p."price" >= :min_price)
          AND (CAST(:max_price AS float8) IS NULL OR p."price" <= :max_price)
          AND (CAST(:in_stock_only AS boolean) = FALSE OR p."stock" > 0)
        ORDER BY p."createdAt" DESC
        LIMIT :limit
        """
    )
    async with async_session() as session:
        result = await session.execute(
            sql,
            {
                "query": query,
                "like": f"%{query}%" if query else None,
                "category": category,
                "category_like": f"%{category}%" if category else None,
                "min_price": min_price,
                "max_price": max_price,
                "in_stock_only": in_stock_only,
                "limit": limit,
            },
        )
        rows = [dict(r) for r in result.mappings()]
    return json.dumps(rows, default=str) if rows else json.dumps({"result": "No matching products found."})


@tool
async def get_product_details(slug: str) -> str:
    """Look up full details for one live product by its exact slug —
    price, stock, description, category, vendor, and any color/material
    variants. Call search_products first if you only have a product name.
    """
    product_sql = text(
        """
        SELECT p."title", p."slug", p."price"::float AS price, p."stock",
               p."description", v."storeName" AS vendor, c."name" AS category
        FROM "Product" p
        JOIN "Vendor" v ON v.id = p."vendorId"
        JOIN "Category" c ON c.id = p."categoryId"
        WHERE p."status" = 'APPROVED' AND p."slug" = :slug
        """
    )
    variants_sql = text(
        """
        SELECT pv."color", pv."material"
        FROM "ProductVariant" pv
        JOIN "Product" p ON p.id = pv."productId"
        WHERE p."slug" = :slug AND p."status" = 'APPROVED'
        """
    )
    async with async_session() as session:
        product = (await session.execute(product_sql, {"slug": slug})).mappings().first()
        if not product:
            return json.dumps({"result": f"No live product found with slug '{slug}'."})
        variants = [dict(r) for r in (await session.execute(variants_sql, {"slug": slug})).mappings()]
    payload = dict(product)
    payload["variants"] = variants
    return json.dumps(payload, default=str)


@tool
async def list_categories() -> str:
    """List every product category currently used by live products, with
    how many approved products are in each. Use this for "what kinds of
    products do you sell" style questions.
    """
    sql = text(
        """
        SELECT c."name", c."slug", COUNT(p.id) AS product_count
        FROM "Category" c
        LEFT JOIN "Product" p ON p."categoryId" = c.id AND p."status" = 'APPROVED'
        GROUP BY c.id
        HAVING COUNT(p.id) > 0
        ORDER BY product_count DESC
        """
    )
    async with async_session() as session:
        rows = [dict(r) for r in (await session.execute(sql)).mappings()]
    return json.dumps(rows, default=str)


@tool
async def list_vendors(query: Optional[str] = None, limit: int = 10) -> str:
    """List storefronts (vendors) that currently have at least one live
    product, optionally filtered by a name/keyword search. Use this for
    "who sells X" or "what stores are on the marketplace" questions.
    """
    limit = max(1, min(limit, 25))
    sql = text(
        """
        SELECT v."storeName" AS store_name, v."slug", v."description",
               COUNT(p.id) AS live_product_count
        FROM "Vendor" v
        JOIN "Product" p ON p."vendorId" = v.id AND p."status" = 'APPROVED'
        WHERE (CAST(:query AS text) IS NULL OR v."storeName" ILIKE :like OR v."description" ILIKE :like)
        GROUP BY v.id
        ORDER BY live_product_count DESC
        LIMIT :limit
        """
    )
    async with async_session() as session:
        rows = [
            dict(r)
            for r in (
                await session.execute(sql, {"query": query, "like": f"%{query}%" if query else None, "limit": limit})
            ).mappings()
        ]
    return json.dumps(rows, default=str) if rows else json.dumps({"result": "No matching vendors found."})


@tool
async def list_active_promo_codes() -> str:
    """List currently active (not expired) promo codes and their discounts.
    Use this when a customer asks about discounts, coupons, or promo codes.
    """
    sql = text(
        """
        SELECT "code", "discountType" AS discount_type,
               "discountValue"::float AS discount_value, "expiresAt" AS expires_at
        FROM "PromoCode"
        WHERE "expiresAt" IS NULL OR "expiresAt" > now()
        ORDER BY "createdAt" DESC
        """
    )
    async with async_session() as session:
        rows = [dict(r) for r in (await session.execute(sql)).mappings()]
    return json.dumps(rows, default=str) if rows else json.dumps({"result": "No active promo codes right now."})


TOOLS = [search_products, get_product_details, list_categories, list_vendors, list_active_promo_codes]
