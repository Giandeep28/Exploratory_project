import csv
from datetime import date
from io import StringIO
from math import isfinite
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Batch, Medicine

router = APIRouter(tags=["imports"])
REQUIRED = {"medicine_name", "company", "price", "threshold_qty", "batch_no", "manufacturing_date", "expiry_date", "quantity"}
MAX_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_ROWS = 5000


@router.get("/imports/template")
def import_template():
    header = "medicine_name,company,price,threshold_qty,batch_no,manufacturing_date,expiry_date,quantity\n"
    return Response(header, media_type="text/csv", headers={
        "Content-Disposition": "attachment; filename=medicine_import_template.csv"})


def parse_csv(raw: bytes):
    try:
        if len(raw) > MAX_UPLOAD_BYTES:
            raise ValueError("file exceeds 2 MB limit")
        text = raw.decode("utf-8-sig")
        reader = csv.DictReader(StringIO(text))
        if not reader.fieldnames or not REQUIRED.issubset(set(reader.fieldnames)):
            raise ValueError("CSV needs columns: " + ", ".join(sorted(REQUIRED)))
        parsed = []
        for line_no, row in enumerate(reader, start=2):
            if line_no > MAX_ROWS + 1:
                raise ValueError(f"CSV exceeds {MAX_ROWS} rows")
            name = (row.get("medicine_name") or "").strip()
            if not name:
                raise ValueError(f"Line {line_no}: medicine_name is required")
            batch_no = (row.get("batch_no") or "").strip()
            if not batch_no:
                raise ValueError(f"Line {line_no}: batch_no is required")
            price = float(row["price"])
            threshold, quantity = int(row["threshold_qty"]), int(row["quantity"])
            expiry = date.fromisoformat((row.get("expiry_date") or "").strip())
            manufacturing_text = (row.get("manufacturing_date") or "").strip()
            manufacturing = date.fromisoformat(manufacturing_text) if manufacturing_text else None
            if not isfinite(price) or price < 0 or threshold < 0 or quantity <= 0 or (manufacturing and manufacturing > expiry):
                raise ValueError(f"Line {line_no}: invalid numeric values or dates")
            parsed.append({"line": line_no, "name": name, "company": (row.get("company") or "").strip() or None,
                "price": price, "threshold": threshold, "batch_no": batch_no,
                "manufacturing": manufacturing, "expiry": expiry, "quantity": quantity})
        if not parsed:
            raise ValueError("CSV contains no data rows")
        return parsed
    except (UnicodeDecodeError, KeyError, TypeError, AttributeError, ValueError, csv.Error) as exc:
        raise HTTPException(422, f"Invalid CSV: {exc}") from exc


@router.post("/imports/preview")
async def preview_csv(file: UploadFile = File(...)):
    rows = parse_csv(await file.read(MAX_UPLOAD_BYTES + 1))
    return {"rows": len(rows), "sample": rows[:10], "columns": sorted(REQUIRED),
            "note": "Preview only. No database records were changed."}


@router.post("/imports/commit")
async def commit_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    rows = parse_csv(await file.read(MAX_UPLOAD_BYTES + 1))
    created_medicines = created_batches = 0
    try:
        for row in rows:
            medicine = db.scalar(select(Medicine).where(Medicine.name == row["name"]))
            if medicine is None:
                medicine = Medicine(name=row["name"], company=row["company"], price=row["price"], threshold_qty=row["threshold"])
                db.add(medicine)
                db.flush()
                created_medicines += 1
            elif db.scalar(select(Batch.id).where(
                    Batch.medicine_id == medicine.id, Batch.batch_no == row["batch_no"])):
                raise ValueError(f"Line {row['line']}: batch already exists")
            db.add(Batch(medicine_id=medicine.id, batch_no=row["batch_no"],
                manufacturing_date=row["manufacturing"], expiry_date=row["expiry"], quantity=row["quantity"]))
            created_batches += 1
        db.commit()
    except (IntegrityError, ValueError) as exc:
        db.rollback()
        raise HTTPException(409, f"Import cancelled; no rows saved: {exc}") from exc
    return {"medicines_created": created_medicines, "batches_created": created_batches}
