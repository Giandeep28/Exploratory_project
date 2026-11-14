from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("medicines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("barcode", sa.String(80)),
        sa.Column("company", sa.String(180)),
        sa.Column("price", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("threshold_qty", sa.Integer(), nullable=False, server_default="10"))
    op.create_index("ix_medicines_name", "medicines", ["name"], unique=True)
    op.create_index("ix_medicines_barcode", "medicines", ["barcode"], unique=True)
    op.create_table("suppliers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(180), nullable=False, unique=True),
        sa.Column("phone", sa.String(40)), sa.Column("email", sa.String(180)))
    op.create_table("batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("medicine_id", sa.Integer(), sa.ForeignKey("medicines.id"), nullable=False),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id")),
        sa.Column("batch_no", sa.String(80), nullable=False),
        sa.Column("manufacturing_date", sa.Date()), sa.Column("expiry_date", sa.Date(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("received_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("medicine_id", "batch_no", name="uq_medicine_batch"))
    op.create_index("ix_batches_medicine_id", "batches", ["medicine_id"])
    op.create_index("ix_batches_expiry_date", "batches", ["expiry_date"])
    op.create_table("sales",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("invoice_no", sa.String(40), nullable=False),
        sa.Column("sold_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False, server_default="0"))
    op.create_index("ix_sales_invoice_no", "sales", ["invoice_no"], unique=True)
    op.create_index("ix_sales_sold_at", "sales", ["sold_at"])
    op.create_table("sale_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sale_id", sa.Integer(), sa.ForeignKey("sales.id", ondelete="CASCADE"), nullable=False),
        sa.Column("medicine_id", sa.Integer(), sa.ForeignKey("medicines.id"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False))
    op.create_index("ix_sale_items_sale_id", "sale_items", ["sale_id"])
    op.create_index("ix_sale_items_medicine_id", "sale_items", ["medicine_id"])


def downgrade():
    op.drop_table("sale_items")
    op.drop_index("ix_sales_sold_at", table_name="sales")
    op.drop_index("ix_sales_invoice_no", table_name="sales")
    op.drop_table("sales")
    op.drop_index("ix_batches_expiry_date", table_name="batches")
    op.drop_index("ix_batches_medicine_id", table_name="batches")
    op.drop_table("batches")
    op.drop_table("suppliers")
    op.drop_index("ix_medicines_barcode", table_name="medicines")
    op.drop_index("ix_medicines_name", table_name="medicines")
    op.drop_table("medicines")
