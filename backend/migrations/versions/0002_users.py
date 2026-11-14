from alembic import op
import sqlalchemy as sa

revision = "0002_users"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("password_hash", sa.String(200), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="user"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_users_username", "users", ["username"], unique=True)


def downgrade():
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
