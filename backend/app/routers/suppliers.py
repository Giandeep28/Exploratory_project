from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Supplier

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


class SupplierData(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=180)


class SupplierOut(SupplierData):
    id: int
    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=list[SupplierOut])
def list_suppliers(db: Session = Depends(get_db)):
    return db.scalars(select(Supplier).order_by(Supplier.name)).all()


@router.post("", response_model=SupplierOut, status_code=201)
def add_supplier(payload: SupplierData, db: Session = Depends(get_db)):
    supplier = Supplier(**payload.model_dump())
    db.add(supplier)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Supplier name already exists") from exc
    db.refresh(supplier)
    return supplier
