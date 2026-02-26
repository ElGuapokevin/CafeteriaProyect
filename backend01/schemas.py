from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

class UsuarioCreate(BaseModel):
    idrol: int
    nombre: str
    email: Optional[EmailStr] = None
    carnet: Optional[str] = None
    telefono: Optional[str] = None
    password: str

class HorarioCreate(BaseModel):
    tiempocomida: str
    hora_inicio: str  # "08:00:00"
    hora_fin: str     # "10:00:00"
    dias_semana: List[int] = [1,2,3,4,5,6,7]
    activo: bool = True

class PlatilloCreate(BaseModel):
    idhorario: Optional[int] = None
    platillo: str
    descripcion: Optional[str] = None
    precio: float
    stock: int = 0
    imagen_url: Optional[str] = None

class DetalleOrdenItem(BaseModel):
    idplatillo: int
    cantidad: int

class OrdenCreate(BaseModel):
    idusuario: int
    idhorario: Optional[int] = None
    pickup_at: Optional[datetime] = None
    notas: Optional[str] = None
    items: List[DetalleOrdenItem]

class OrdenEstadoUpdate(BaseModel):
    estado: str

class PagoCreate(BaseModel):
    idorden: int
    metodo: str
    monto: float
    referencia: Optional[str] = None