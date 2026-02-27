from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from db import get_conn
from schemas import (
    UsuarioCreate, HorarioCreate, PlatilloCreate,
    OrdenCreate, OrdenEstadoUpdate, PagoCreate, LoginRequest
)
from datetime import datetime
import random, string

app = FastAPI(title="API Cafetería")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def gen_codigo_retiro(n=8):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=n))

@app.get("/")
def root():
    return {"mensaje": "API Cafetería activa ✅", "docs": "/docs"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/db-test")
def db_test():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT
            NOW() AS now,
            current_database() AS db,
            current_user AS db_user,
            inet_server_addr() AS server_addr,
            inet_server_port() AS server_port;
    """)
    row = cur.fetchone()
    cur.close()
    conn.close()
    return dict(row) if row else {}

# -----------------------
# ROLES
# -----------------------
@app.get("/roles")
def list_roles():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT idrol, rol, descripcion, created_at FROM public.rol ORDER BY idrol;")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows

# -----------------------
# USUARIOS
# -----------------------
@app.post("/usuarios")
def create_usuario(data: UsuarioCreate):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO public.usuarios (idrol, nombre, email, carnet, telefono, password)
            VALUES (%s,%s,%s,%s,%s,%s)
            RETURNING idusuario, idrol, nombre, email, carnet, telefono, activo, created_at;
        """, (data.idrol, data.nombre, data.email, data.carnet, data.telefono, data.password))
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cur.close(); conn.close()

@app.get("/usuarios")
def list_usuarios():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT idusuario, idrol, nombre, email, carnet, telefono, activo, created_at
        FROM public.usuarios
        ORDER BY idusuario DESC;
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return rows


@app.post("/auth/login")
def login(data: LoginRequest):
    identificador = data.identificador.strip()
    if not identificador:
        raise HTTPException(status_code=400, detail="Identificador requerido")

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT
            u.idusuario,
            u.idrol,
            r.rol,
            u.nombre,
            u.email,
            u.carnet,
            u.telefono,
            u.activo
        FROM public.usuarios u
        JOIN public.rol r ON r.idrol = u.idrol
        WHERE (u.email = %s OR u.carnet = %s)
        LIMIT 1;
    """, (identificador, identificador))
    user = cur.fetchone()
    cur.close(); conn.close()

    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if not user["activo"]:
        raise HTTPException(status_code=403, detail="Usuario inactivo")

    return user

# -----------------------
# HORARIOS
# -----------------------
@app.post("/horarios")
def create_horario(data: HorarioCreate):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO public.horarios (tiempocomida, hora_inicio, hora_fin, dias_semana, activo)
            VALUES (%s,%s,%s,%s,%s)
            RETURNING *;
        """, (data.tiempocomida, data.hora_inicio, data.hora_fin, data.dias_semana, data.activo))
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cur.close(); conn.close()

@app.get("/horarios")
def list_horarios():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM public.horarios ORDER BY idhorario DESC;")
    rows = cur.fetchall()
    cur.close(); conn.close()
    return rows

# -----------------------
# PLATILLOS
# -----------------------
@app.post("/platillos")
def create_platillo(data: PlatilloCreate):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO public.platillos (idhorario, platillo, descripcion, precio, stock, imagen_url)
            VALUES (%s,%s,%s,%s,%s,%s)
            RETURNING *;
        """, (data.idhorario, data.platillo, data.descripcion, data.precio, data.stock, data.imagen_url))
        row = cur.fetchone()
        conn.commit()
        return row
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cur.close(); conn.close()

@app.get("/platillos")
def list_platillos(idhorario: int | None = None):
    conn = get_conn()
    cur = conn.cursor()
    if idhorario is not None:
        cur.execute("SELECT * FROM public.platillos WHERE idhorario=%s ORDER BY idplatillo DESC;", (idhorario,))
    else:
        cur.execute("SELECT * FROM public.platillos ORDER BY idplatillo DESC;")
    rows = cur.fetchall()
    cur.close(); conn.close()
    return rows

# -----------------------
# ORDENES (lo importante)
# -----------------------
@app.post("/ordenes")
def crear_orden(data: OrdenCreate):
    if not data.items:
        raise HTTPException(status_code=400, detail="La orden debe incluir items.")

    conn = get_conn()
    cur = conn.cursor()
    try:
        # 1) crear orden con codigo único (reintento simple)
        codigo = gen_codigo_retiro()
        for _ in range(5):
            cur.execute("SELECT 1 FROM public.orden WHERE codigo_retiro=%s;", (codigo,))
            if not cur.fetchone():
                break
            codigo = gen_codigo_retiro()

        cur.execute("""
            INSERT INTO public.orden (idusuario, idhorario, codigo_retiro, pickup_at, notas, total)
            VALUES (%s,%s,%s,%s,%s,0)
            RETURNING idorden, codigo_retiro, estado, pickup_at, created_at;
        """, (data.idusuario, data.idhorario, codigo, data.pickup_at, data.notas))
        orden = cur.fetchone()
        idorden = orden["idorden"]

        total = 0.0
        detalles = []

        # 2) insertar detalle_orden (precio actual del platillo) + calcular total
        for item in data.items:
            cur.execute("""
                SELECT idplatillo, precio, stock
                FROM public.platillos
                WHERE idplatillo=%s;
            """, (item.idplatillo,))
            p = cur.fetchone()
            if not p:
                raise HTTPException(status_code=404, detail=f"Platillo {item.idplatillo} no existe.")
            if item.cantidad <= 0:
                raise HTTPException(status_code=400, detail="Cantidad inválida.")
            if p["stock"] < item.cantidad:
                raise HTTPException(status_code=400, detail=f"Stock insuficiente para platillo {item.idplatillo}.")

            precio_unit = float(p["precio"])
            subtotal = precio_unit * item.cantidad
            total += subtotal

            # descuenta stock
            cur.execute("""
                UPDATE public.platillos
                SET stock = stock - %s
                WHERE idplatillo=%s;
            """, (item.cantidad, item.idplatillo))

            cur.execute("""
                INSERT INTO public.detalle_orden (idorden, idplatillo, cantidad, precio_unitario, subtotal)
                VALUES (%s,%s,%s,%s,%s)
                RETURNING *;
            """, (idorden, item.idplatillo, item.cantidad, precio_unit, subtotal))

            detalles.append(cur.fetchone())

        # 3) actualizar total de orden
        cur.execute("""
            UPDATE public.orden
            SET total=%s
            WHERE idorden=%s
            RETURNING idorden, idusuario, idhorario, codigo_retiro, estado, pickup_at, notas, total, created_at, updated_at;
        """, (total, idorden))
        orden_full = cur.fetchone()

        conn.commit()
        return {"orden": orden_full, "detalles": detalles}

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cur.close(); conn.close()

@app.get("/ordenes")
def listar_ordenes(idusuario: int | None = None, estado: str | None = None):
    conn = get_conn()
    cur = conn.cursor()

    q = "SELECT * FROM public.orden WHERE 1=1"
    params = []
    if idusuario is not None:
        q += " AND idusuario=%s"
        params.append(idusuario)
    if estado is not None:
        q += " AND estado=%s"
        params.append(estado)
    q += " ORDER BY created_at DESC;"

    cur.execute(q, params)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return rows

@app.get("/ordenes/{idorden}")
def ver_orden(idorden: int):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM public.orden WHERE idorden=%s;", (idorden,))
    orden = cur.fetchone()
    if not orden:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Orden no existe.")

    cur.execute("""
        SELECT d.*, p.platillo
        FROM public.detalle_orden d
        JOIN public.platillos p ON p.idplatillo=d.idplatillo
        WHERE d.idorden=%s
        ORDER BY d.iddetalleorden;
    """, (idorden,))
    detalles = cur.fetchall()

    cur.close(); conn.close()
    return {"orden": orden, "detalles": detalles}

@app.patch("/ordenes/{idorden}/estado")
def cambiar_estado(idorden: int, data: OrdenEstadoUpdate):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE public.orden
            SET estado=%s
            WHERE idorden=%s
            RETURNING *;
        """, (data.estado, idorden))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Orden no existe.")
        conn.commit()
        return row
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cur.close(); conn.close()

@app.get("/ordenes/codigo/{codigo}")
def ver_orden_por_codigo(codigo: str):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT * FROM public.orden WHERE codigo_retiro=%s;", (codigo,))
    orden = cur.fetchone()

    if not orden:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Orden no existe para ese código.")

    # Traer detalles usando el idorden encontrado
    cur.execute("""
        SELECT d.*, p.platillo
        FROM public.detalle_orden d
        JOIN public.platillos p ON p.idplatillo=d.idplatillo
        WHERE d.idorden=%s
        ORDER BY d.iddetalleorden;
    """, (orden["idorden"],))

    detalles = cur.fetchall()

    cur.close(); conn.close()
    return {"orden": orden, "detalles": detalles}

@app.get("/cocina/cola")
def cola_cocina():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM public.orden
        WHERE estado IN ('pagada','en_preparacion','lista')
        ORDER BY created_at ASC;
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return rows

# -----------------------
# PAGOS
# -----------------------
@app.post("/pagos")
def crear_pago(data: PagoCreate):
    conn = get_conn()
    cur = conn.cursor()
    try:
        # marcar pago como aprobado + pagado_at
        cur.execute("""
            INSERT INTO public.pagos (idorden, metodo, estado, monto, referencia, pagado_at)
            VALUES (%s,%s,'aprobado',%s,%s,now())
            RETURNING *;
        """, (data.idorden, data.metodo, data.monto, data.referencia))
        pago = cur.fetchone()

        # si querés: cuando hay pago aprobado -> orden pasa a "pagada"
        cur.execute("""
            UPDATE public.orden
            SET estado='pagada'
            WHERE idorden=%s AND estado='pendiente'
            RETURNING *;
        """, (data.idorden,))
        orden = cur.fetchone()

        conn.commit()
        return {"pago": pago, "orden_actualizada": orden}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cur.close(); conn.close()