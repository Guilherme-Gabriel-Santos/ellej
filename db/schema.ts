import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    material: text("material").notNull(),
    image: text("image").notNull(),
    badge: text("badge"),
    priceCents: integer("price_cents").notNull(),
    compareAtCents: integer("compare_at_cents"),
    stock: integer("stock").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_products_slug").on(table.slug),
    index("idx_products_category_active").on(table.category, table.active),
  ],
);

export const favorites = sqliteTable(
  "favorites",
  {
    visitorId: text("visitor_id").notNull(),
    productId: text("product_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.visitorId, table.productId] }),
    index("idx_favorites_visitor_id").on(table.visitorId),
  ],
);

export const cartItems = sqliteTable(
  "cart_items",
  {
    visitorId: text("visitor_id").notNull(),
    productId: text("product_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.visitorId, table.productId] }),
    index("idx_cart_items_visitor_id").on(table.visitorId),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    visitorId: text("visitor_id").notNull(),
    customerName: text("customer_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    cpf: text("cpf"),
    cep: text("cep").notNull(),
    address: text("address").notNull(),
    addressNumber: text("address_number").notNull(),
    complement: text("complement"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    shippingMethod: text("shipping_method").notNull(),
    paymentMethod: text("payment_method").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    status: text("status").notNull().default("aguardando_pagamento"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_orders_visitor_id_created_at").on(table.visitorId, table.createdAt),
    index("idx_orders_email").on(table.email),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: text("order_id").notNull(),
    productId: text("product_id").notNull(),
    productName: text("product_name").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (table) => [index("idx_order_items_order_id").on(table.orderId)],
);

export const subscribers = sqliteTable(
  "subscribers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_subscribers_email").on(table.email)],
);

export const adminUsers = sqliteTable(
  "admin_users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: integer("locked_until"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_admin_users_email").on(table.email)],
);

export const adminLoginChallenges = sqliteTable(
  "admin_login_challenges",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: integer("consumed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_admin_challenges_user_expires").on(table.userId, table.expiresAt)],
);

export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    expiresAt: integer("expires_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_admin_sessions_user_expires").on(table.userId, table.expiresAt)],
);

export const adminAuditLogs = sqliteTable(
  "admin_audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    details: text("details"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_admin_audit_created_at").on(table.createdAt)],
);

export const mediaAssets = sqliteTable(
  "media_assets",
  {
    key: text("key").primaryKey(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    originalName: text("original_name").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_media_assets_created_at").on(table.createdAt)],
);
