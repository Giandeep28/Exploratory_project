from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field


class MedicineIn(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    barcode: str | None = Field(default=None, max_length=80)
    company: str | None = None
    price: float = Field(ge=0)
    threshold_qty: int = Field(default=10, ge=0)


class MedicineOut(MedicineIn):
    id: int
    model_config = ConfigDict(from_attributes=True)


class BatchIn(BaseModel):
    medicine_id: int
    batch_no: str
    manufacturing_date: date | None = None
    expiry_date: date
    quantity: int = Field(gt=0)
    supplier_id: int | None = None


class BatchOut(BatchIn):
    id: int
    model_config = ConfigDict(from_attributes=True)


class SaleLineIn(BaseModel):
    medicine_id: int
    quantity: int = Field(gt=0)


class SaleIn(BaseModel):
    items: list[SaleLineIn] = Field(min_length=1)


class SaleOut(BaseModel):
    id: int
    invoice_no: str
    sold_at: datetime
    total_amount: float
    model_config = ConfigDict(from_attributes=True)
