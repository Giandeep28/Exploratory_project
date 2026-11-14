from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Medicine(Base):
    __tablename__ = "medicines"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    barcode: Mapped[str | None] = mapped_column(String(80), unique=True, index=True)
    company: Mapped[str | None] = mapped_column(String(180))
    price: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    threshold_qty: Mapped[int] = mapped_column(Integer, default=10)
    batches: Mapped[list["Batch"]] = relationship(back_populates="medicine", cascade="all, delete-orphan")


class Supplier(Base):
    __tablename__ = "suppliers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(180), unique=True)
    phone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(180))


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Batch(Base):
    __tablename__ = "batches"
    __table_args__ = (UniqueConstraint("medicine_id", "batch_no", name="uq_medicine_batch"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    medicine_id: Mapped[int] = mapped_column(ForeignKey("medicines.id"), index=True)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"))
    batch_no: Mapped[str] = mapped_column(String(80))
    manufacturing_date: Mapped[date | None] = mapped_column(Date)
    expiry_date: Mapped[date] = mapped_column(Date, index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    received_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    medicine: Mapped[Medicine] = relationship(back_populates="batches")


class Sale(Base):
    __tablename__ = "sales"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    sold_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    items: Mapped[list["SaleItem"]] = relationship(back_populates="sale", cascade="all, delete-orphan")


class SaleItem(Base):
    __tablename__ = "sale_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id", ondelete="CASCADE"), index=True)
    medicine_id: Mapped[int] = mapped_column(ForeignKey("medicines.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2))
    sale: Mapped[Sale] = relationship(back_populates="items")
