'use strict';

/**
 * Registre des modèles et de leurs associations.
 *
 * Les colonnes de chaque modèle reflètent EXACTEMENT les migrations
 * (src/migrations) — seule source de vérité du schéma. Ce fichier ne déclare
 * que les liens utilisés par les `include` des services (jointures en une
 * requête, jamais de chargement ligne à ligne : pas de N+1).
 *
 * Aucune association ne pose de cascade applicative : les suppressions sont
 * logiques (paranoid), par statut, ou interdites par les clés étrangères.
 */

const sequelize = require('../config/db.js');

const Role = require('./role.model.js');
const User = require('./user.model.js');
const Company = require('./company.model.js');
const CompanyMember = require('./companyMember.model.js');
const MemberInvitation = require('./memberInvitation.model.js');
const SubscriptionPlan = require('./subscriptionPlan.model.js');
const Subscription = require('./subscription.model.js');
const SubscriptionPayment = require('./subscriptionPayment.model.js');
const RefreshToken = require('./refreshToken.model.js');
const PasswordReset = require('./passwordReset.model.js');
const DeviceToken = require('./deviceToken.model.js');
const PlatformSetting = require('./platformSetting.model.js');
const IdempotencyKey = require('./idempotencyKey.model.js');
const Counter = require('./counter.model.js');
const AuditLog = require('./auditLog.model.js');
const Notification = require('./notification.model.js');
const Document = require('./document.model.js');
const Partnership = require('./partnership.model.js');
const PartnershipInvitation = require('./partnershipInvitation.model.js');
const ProductCategory = require('./productCategory.model.js');
const Product = require('./product.model.js');
const Order = require('./order.model.js');
const OrderVersion = require('./orderVersion.model.js');
const OrderLine = require('./orderLine.model.js');
const OrderEvent = require('./orderEvent.model.js');
const DocumentTemplate = require('./documentTemplate.model.js');
const Invoice = require('./invoice.model.js');
const InvoiceLine = require('./invoiceLine.model.js');
const Payment = require('./payment.model.js');
const PaymentAllocation = require('./paymentAllocation.model.js');
const ProductPriceTier = require('./productPriceTier.model.js');
const PriceList = require('./priceList.model.js');
const PriceListItem = require('./priceListItem.model.js');
const StockMovement = require('./stockMovement.model.js');
const PurchaseList = require('./purchaseList.model.js');
const PurchaseListItem = require('./purchaseListItem.model.js');
const OrderApproval = require('./orderApproval.model.js');
const Delivery = require('./delivery.model.js');
const DeliveryLine = require('./deliveryLine.model.js');
const CreditNote = require('./creditNote.model.js');
const CreditNoteLine = require('./creditNoteLine.model.js');
const CreditNoteAllocation = require('./creditNoteAllocation.model.js');
const Claim = require('./claim.model.js');
const ClaimLine = require('./claimLine.model.js');
const InvoiceReminder = require('./invoiceReminder.model.js');

const fk = (foreignKey, as) => ({ foreignKey, as });

// ── Comptes et entreprises ────────────────────────────────────────────────
User.belongsTo(Role, fk('role_code', 'role'));
CompanyMember.belongsTo(Company, fk('company_id', 'company'));
CompanyMember.belongsTo(User, fk('user_id', 'user'));
CompanyMember.belongsTo(Role, fk('role_code', 'role'));
User.hasMany(CompanyMember, fk('user_id', 'memberships'));
Company.hasMany(CompanyMember, fk('company_id', 'members'));
Company.belongsTo(Document, fk('logo_document_id', 'logo'));
MemberInvitation.belongsTo(Company, fk('company_id', 'company'));

Subscription.belongsTo(SubscriptionPlan, fk('plan_id', 'plan'));
Subscription.belongsTo(Company, fk('company_id', 'company'));
Company.hasMany(Subscription, fk('company_id', 'subscriptions'));
SubscriptionPayment.belongsTo(SubscriptionPlan, fk('plan_id', 'plan'));
SubscriptionPayment.belongsTo(Company, fk('company_id', 'company'));

RefreshToken.belongsTo(User, fk('user_id', 'user'));
Notification.belongsTo(User, fk('user_id', 'user'));

// ── Réseau et catalogue ───────────────────────────────────────────────────
Partnership.belongsTo(Company, fk('buyer_company_id', 'buyer'));
Partnership.belongsTo(Company, fk('supplier_company_id', 'supplier'));
PartnershipInvitation.belongsTo(Company, fk('company_id', 'company'));

ProductCategory.belongsTo(Company, fk('company_id', 'company'));
Product.belongsTo(ProductCategory, fk('category_id', 'category'));
Product.belongsTo(Company, fk('company_id', 'company'));
Product.belongsTo(Document, fk('photo_document_id', 'photo'));

// ── Commandes ─────────────────────────────────────────────────────────────
Order.belongsTo(Company, fk('buyer_company_id', 'buyer'));
Order.belongsTo(Company, fk('supplier_company_id', 'supplier'));
Order.belongsTo(Partnership, fk('partnership_id', 'partnership'));
Order.belongsTo(User, fk('created_by', 'creator'));
Order.hasMany(OrderVersion, fk('order_id', 'versions'));
Order.hasMany(OrderLine, fk('order_id', 'lines'));
Order.hasMany(OrderEvent, fk('order_id', 'events'));
Order.hasOne(Invoice, fk('order_id', 'invoice'));
OrderVersion.belongsTo(Order, fk('order_id', 'order'));
OrderVersion.hasMany(OrderLine, fk('version_id', 'lines'));
OrderLine.belongsTo(OrderVersion, fk('version_id', 'version'));
OrderLine.belongsTo(Product, fk('product_id', 'product'));
OrderEvent.belongsTo(Order, fk('order_id', 'order'));
OrderEvent.belongsTo(User, fk('actor_user_id', 'actor'));
OrderEvent.belongsTo(Company, fk('actor_company_id', 'actorCompany'));

// ── Facturation et paiements ──────────────────────────────────────────────
DocumentTemplate.belongsTo(Company, fk('company_id', 'company'));
DocumentTemplate.belongsTo(Document, fk('background_document_id', 'background'));

Invoice.belongsTo(Company, fk('supplier_company_id', 'supplier'));
Invoice.belongsTo(Company, fk('buyer_company_id', 'buyer'));
Invoice.belongsTo(Order, fk('order_id', 'order'));
Invoice.belongsTo(Partnership, fk('partnership_id', 'partnership'));
Invoice.belongsTo(DocumentTemplate, fk('template_id', 'template'));
Invoice.hasMany(InvoiceLine, fk('invoice_id', 'lines'));
Invoice.hasMany(PaymentAllocation, fk('invoice_id', 'allocations'));
InvoiceLine.belongsTo(Invoice, fk('invoice_id', 'invoice'));

Payment.belongsTo(Company, fk('supplier_company_id', 'supplier'));
Payment.belongsTo(Company, fk('buyer_company_id', 'buyer'));
Payment.belongsTo(Partnership, fk('partnership_id', 'partnership'));
Payment.hasMany(PaymentAllocation, fk('payment_id', 'allocations'));
PaymentAllocation.belongsTo(Payment, fk('payment_id', 'payment'));
PaymentAllocation.belongsTo(Invoice, fk('invoice_id', 'invoice'));
Invoice.hasMany(InvoiceReminder, fk('invoice_id', 'reminders'));
InvoiceReminder.belongsTo(Invoice, fk('invoice_id', 'invoice'));

// ── Tarification et stock ─────────────────────────────────────────────────
Product.hasMany(ProductPriceTier, fk('product_id', 'priceTiers'));
ProductPriceTier.belongsTo(Product, fk('product_id', 'product'));
PriceList.hasMany(PriceListItem, fk('price_list_id', 'items'));
PriceListItem.belongsTo(PriceList, fk('price_list_id', 'priceList'));
PriceListItem.belongsTo(Product, fk('product_id', 'product'));
Partnership.belongsTo(PriceList, fk('price_list_id', 'priceList'));
StockMovement.belongsTo(Product, fk('product_id', 'product'));
StockMovement.belongsTo(User, fk('created_by', 'author'));

// ── Achats : listes, approbations ─────────────────────────────────────────
PurchaseList.belongsTo(Company, fk('supplier_company_id', 'supplier'));
PurchaseList.hasMany(PurchaseListItem, fk('list_id', 'items'));
PurchaseListItem.belongsTo(PurchaseList, fk('list_id', 'list'));
PurchaseListItem.belongsTo(Product, fk('product_id', 'product'));
Order.hasMany(OrderApproval, fk('order_id', 'approvals'));
OrderApproval.belongsTo(User, fk('user_id', 'user'));

// ── Livraisons, litiges, avoirs ───────────────────────────────────────────
Order.hasMany(Delivery, fk('order_id', 'deliveries'));
Delivery.belongsTo(Order, fk('order_id', 'order'));
Delivery.hasMany(DeliveryLine, fk('delivery_id', 'lines'));
DeliveryLine.belongsTo(Delivery, fk('delivery_id', 'delivery'));
Delivery.belongsTo(Company, fk('supplier_company_id', 'supplier'));
Delivery.belongsTo(Company, fk('buyer_company_id', 'buyer'));
Claim.belongsTo(Order, fk('order_id', 'order'));
Claim.belongsTo(Company, fk('buyer_company_id', 'buyer'));
Claim.belongsTo(Company, fk('supplier_company_id', 'supplier'));
Claim.belongsTo(Delivery, fk('delivery_id', 'delivery'));
Claim.belongsTo(CreditNote, fk('credit_note_id', 'creditNote'));
Claim.hasMany(ClaimLine, fk('claim_id', 'lines'));
ClaimLine.belongsTo(Claim, fk('claim_id', 'claim'));
CreditNote.belongsTo(Company, fk('supplier_company_id', 'supplier'));
CreditNote.belongsTo(Company, fk('buyer_company_id', 'buyer'));
CreditNote.belongsTo(Order, fk('order_id', 'order'));
CreditNote.belongsTo(Invoice, fk('invoice_id', 'invoice'));
CreditNote.hasMany(CreditNoteLine, fk('credit_note_id', 'lines'));
CreditNote.hasMany(CreditNoteAllocation, fk('credit_note_id', 'allocations'));
CreditNoteLine.belongsTo(CreditNote, fk('credit_note_id', 'creditNote'));
CreditNoteAllocation.belongsTo(CreditNote, fk('credit_note_id', 'creditNote'));
CreditNoteAllocation.belongsTo(Invoice, fk('invoice_id', 'invoice'));
Invoice.hasMany(CreditNoteAllocation, fk('invoice_id', 'creditAllocations'));

module.exports = {
  sequelize,
  Role, User, Company, CompanyMember, MemberInvitation,
  SubscriptionPlan, Subscription, SubscriptionPayment,
  RefreshToken, PasswordReset, DeviceToken, PlatformSetting, IdempotencyKey, Counter,
  AuditLog, Notification, Document,
  Partnership, PartnershipInvitation, ProductCategory, Product,
  Order, OrderVersion, OrderLine, OrderEvent,
  DocumentTemplate, Invoice, InvoiceLine, Payment, PaymentAllocation,
  ProductPriceTier, PriceList, PriceListItem, StockMovement, PurchaseList, PurchaseListItem, OrderApproval,
  Delivery, DeliveryLine, CreditNote, CreditNoteLine, CreditNoteAllocation, Claim, ClaimLine, InvoiceReminder,
};
