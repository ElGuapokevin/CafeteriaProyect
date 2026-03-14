-- =========================================================
-- COMEDOR / CAFETERIA (POSTGRESQL)
-- Objetivo: reducir filas con pickup_at + codigo_retiro
-- =========================================================

-- ===============================
-- ENUMS
-- ===============================
DO $$ BEGIN
  CREATE TYPE public.orden_estado AS ENUM
    ('pendiente','pagada','en_preparacion','lista','entregada','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pago_metodo AS ENUM
    ('efectivo','tarjeta','transferencia','billetera');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pago_estado AS ENUM
    ('pendiente','aprobado','rechazado','reembolsado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===============================
-- FUNCION + TRIGGER updated_at
-- ===============================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===============================
-- TABLAS
-- ===============================

-- /****************************/
-- rol
CREATE TABLE IF NOT EXISTS public.rol (
  idrol       BIGSERIAL PRIMARY KEY,
  rol         VARCHAR(30) NOT NULL UNIQUE,
  descripcion TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- /****************************/
-- usuarios
CREATE TABLE IF NOT EXISTS public.usuarios (
  idusuario  BIGSERIAL PRIMARY KEY,
  idrol      BIGINT NOT NULL REFERENCES public.rol(idrol),
  nombre     VARCHAR(120) NOT NULL,
  email      VARCHAR(150) UNIQUE,
  carnet     VARCHAR(30),              -- opcional
  telefono   VARCHAR(30),              -- opcional
  password   TEXT NOT NULL,            -- texto plano (como pediste)
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (Opcional) Si querés que carnet sea único cuando exista:
-- En Postgres, UNIQUE permite múltiples NULL, así que está bien.
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_carnet
  ON public.usuarios (carnet)
  WHERE carnet IS NOT NULL;

-- /****************************/
-- horarios
CREATE TABLE IF NOT EXISTS public.horarios (
  idhorario    BIGSERIAL PRIMARY KEY,
  tiempocomida VARCHAR(60) NOT NULL,   -- desayuno/almuerzo/etc
  hora_inicio  TIME NOT NULL,
  hora_fin     TIME NOT NULL,
  dias_semana  INT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7], -- 1=lun ... 7=dom
  activo       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT horarios_hora_check CHECK (hora_fin > hora_inicio),

  -- ✅ FIX POSTGRES: sin subconsulta en CHECK
  CONSTRAINT horarios_dias_check CHECK (
    array_length(dias_semana, 1) >= 1
    AND dias_semana <@ ARRAY[1,2,3,4,5,6,7]::int[]
  )
);

-- /****************************/
-- platillos
CREATE TABLE IF NOT EXISTS public.platillos (
  idplatillo  BIGSERIAL PRIMARY KEY,
  idhorario   BIGINT REFERENCES public.horarios(idhorario),
  platillo    VARCHAR(120) NOT NULL,
  descripcion TEXT,
  precio      NUMERIC(12,2) NOT NULL CHECK (precio >= 0),
  stock       INT NOT NULL DEFAULT 0 CHECK (stock >= 0), -- opcional, pero incluido
  imagen_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- /****************************/
-- orden
CREATE TABLE IF NOT EXISTS public.orden (
  idorden       BIGSERIAL PRIMARY KEY,
  idusuario     BIGINT NOT NULL REFERENCES public.usuarios(idusuario),
  idhorario     BIGINT REFERENCES public.horarios(idhorario),
  codigo_retiro VARCHAR(20) NOT NULL UNIQUE,
  estado        public.orden_estado NOT NULL DEFAULT 'pendiente',
  pickup_at     TIMESTAMPTZ,   -- hora programada de retiro
  notas         TEXT,
  total         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_orden_updated_at ON public.orden;
CREATE TRIGGER trg_orden_updated_at
BEFORE UPDATE ON public.orden
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- /****************************/
-- detalle_orden
CREATE TABLE IF NOT EXISTS public.detalle_orden (
  iddetalleorden  BIGSERIAL PRIMARY KEY,
  idorden         BIGINT NOT NULL REFERENCES public.orden(idorden) ON DELETE CASCADE,
  idplatillo      BIGINT NOT NULL REFERENCES public.platillos(idplatillo),
  cantidad        INT NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
  subtotal        NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0)
);

-- /****************************/
-- pagos
CREATE TABLE IF NOT EXISTS public.pagos (
  idpago     BIGSERIAL PRIMARY KEY,
  idorden    BIGINT NOT NULL REFERENCES public.orden(idorden) ON DELETE CASCADE,
  metodo     public.pago_metodo NOT NULL,
  estado     public.pago_estado NOT NULL DEFAULT 'pendiente',
  monto      NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  referencia VARCHAR(120),
  pagado_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- /****************************/
-- facturas
CREATE TABLE IF NOT EXISTS public.facturas (
  idfactura  BIGSERIAL PRIMARY KEY,
  idpago     BIGINT NOT NULL UNIQUE REFERENCES public.pagos(idpago) ON DELETE CASCADE,
  serie      VARCHAR(20),
  numero     VARCHAR(30),
  nit        VARCHAR(20),
  nombre     VARCHAR(150),
  direccion  TEXT,
  subtotal   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  impuesto   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (impuesto >= 0),
  total      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  emitida_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pdf_url    TEXT
);

-- ===============================
-- INDICES (rendimiento / colas)
-- ===============================
CREATE INDEX IF NOT EXISTS idx_orden_pickup
  ON public.orden (pickup_at);

CREATE INDEX IF NOT EXISTS idx_orden_estado
  ON public.orden (estado);

CREATE INDEX IF NOT EXISTS idx_orden_usuario_fecha
  ON public.orden (idusuario, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_detalle_orden_idorden
  ON public.detalle_orden (idorden);

CREATE INDEX IF NOT EXISTS idx_pagos_idorden
  ON public.pagos (idorden);

CREATE INDEX IF NOT EXISTS idx_platillos_idhorario
  ON public.platillos (idhorario);

-- ===============================
-- DATOS INICIALES (roles)
-- ===============================
INSERT INTO public.rol (rol, descripcion)
VALUES
 ('admin','Administrador del sistema'),
 ('cliente','Cliente que realiza pedidos'),
 ('cajero','Recibe pagos / valida órdenes'),
 ('cocina','Prepara órdenes')
ON CONFLICT (rol) DO NOTHING;

-- =========================================================
-- 6 DATOS PARA CADA TABLA
-- =========================================================

-- /****************************/
-- rol (ya tenías 4; agrego 2 más para llegar a 6)
INSERT INTO public.rol (rol, descripcion) VALUES
('admin','Administrador del sistema'),
('cliente','Cliente que realiza pedidos'),
('cajero','Recibe pagos / valida órdenes'),
('cocina','Prepara órdenes'),
('mesero','Apoyo en entrega / atención'),
('supervisor','Supervisa operación')
ON CONFLICT (rol) DO NOTHING;

-- /****************************/
-- usuarios (6)
INSERT INTO public.usuarios (idrol, nombre, email, carnet, telefono, password, activo) VALUES
((SELECT idrol FROM public.rol WHERE rol='admin'),      'Admin Comedor',   'admin@comedor.local',    NULL,        '5555-0001', 'admin123', true),
((SELECT idrol FROM public.rol WHERE rol='cajero'),     'Cajero Uno',      'cajero1@comedor.local',  NULL,        NULL,        'cajero123', true),
((SELECT idrol FROM public.rol WHERE rol='cocina'),     'Cocinero Uno',    'cocina1@comedor.local',  NULL,        '5555-0003', 'cocina123', true),
((SELECT idrol FROM public.rol WHERE rol='cliente'),    'Kevin Mazar',     'kevin@correo.com',       'A2026001',  '5555-0101', '1234', true),
((SELECT idrol FROM public.rol WHERE rol='cliente'),    'Ana López',       'ana@correo.com',         NULL,        '5555-0102', '1234', true),
((SELECT idrol FROM public.rol WHERE rol='cliente'),    'Luis Pérez',      'luis@correo.com',        'A2026003',  NULL,        '1234', true)
ON CONFLICT (email) DO NOTHING;

-- /****************************/
-- horarios (6)
INSERT INTO public.horarios (tiempocomida, hora_inicio, hora_fin, dias_semana, activo) VALUES
('Desayuno',   '07:00', '09:30', ARRAY[1,2,3,4,5]::int[], true),
('Refaccion',  '10:00', '11:00', ARRAY[1,2,3,4,5]::int[], true),
('Almuerzo',   '12:00', '14:30', ARRAY[1,2,3,4,5]::int[], true),
('Merienda',   '15:30', '16:30', ARRAY[1,2,3,4,5]::int[], true),
('Cena',       '18:00', '20:30', ARRAY[1,2,3,4,5,6]::int[], true),
('FinDeSemana','09:00', '13:00', ARRAY[6,7]::int[], true);

-- /****************************/
-- platillos (6)  (nombres únicos para que los SELECT sean claros)
INSERT INTO public.platillos (idhorario, platillo, descripcion, precio, stock, imagen_url) VALUES
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayuno'),   'Desayuno Chapin', 'Huevos + frijol + plátano', 20.00, 50, 'https://www.haceloconhuevos.com/wp-content/uploads/2022/05/Desayuno-Ti%CC%81pico-Chapi%CC%81n.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayuno'),   'Panqueques',      'Panqueques con miel',       18.00, 30, 'https://www.rionegro.com.ar/wp-content/uploads/binrepository/image_content_10153684_20180928094306.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Almuerzo'),   'Pollo Asado',     'Pollo con arroz y ensalada',35.00, 40, 'https://i.pinimg.com/736x/e8/24/35/e82435ff3b45ccdb07121fd172f9ce2f.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Almuerzo'),   'Carne Guisada',   'Carne con papas y arroz',   38.00, 35, 'https://es.riverheadlocal.com/wp-content/uploads/2018/06/2018_0623_carne_guisada.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Almuerzo'),       'Hamburguesa',     'Hamburguesa con papas',     30.00, 25, 'https://static.vecteezy.com/system/resources/thumbnails/070/327/872/small/a-hamburger-with-cheese-lettuce-and-onions-photo.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Refaccion'),  'Licuado Banana',  'Licuado de banano',         12.00, 60, 'https://s3.amazonaws.com/static.realcaliforniamilk.com/media/recipes_2/banana-cardamom-milkshake.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Refaccion'),  'Coca Cola',  'Coca Cola ', 8.00, 60, 'https://superlacasita.com.gt/wp-content/uploads/2020/06/Bebidas-Sin-Alcohol-Agua-Gaseosa-Coca-Cola-Plastico-600-ml.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayuno'),  'Empanada',  'Empanada de carne', 10.00, 30, 'https://familiakitchen.com/wp-content/uploads/2021/09/Empanadas-open-e1631296397215.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayuno'),  'Tostadas',  'Tostadas con frijol y queso', 6.00, 30, 'https://pbs.twimg.com/media/CyNef_bWEAAsFSm.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayuno'),  'Panes de Chile Relleno',  'Chiles rellenos de carne', 10.00, 20, 'https://media-cdn.tripadvisor.com/media/photo-s/0f/91/da/a5/pan-con-chile-relleno.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Almuerzo'),  'Carne Asada',  'Carne asada guacamole y ensalada', 25.00, 30, 'https://storage.googleapis.com/avena-recipes-v2/2019/10/1571779556799.jpeg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Postre'),  'Flan',  'Flan de vainilla', 9.00, 30, 'https://dietamediterranea.com/wp-content/uploads/2017/04/20170424-Flan-1024x768.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Postre'),  'Gelatina',  'Gelatina de sabores', 5.00, 50, 'https://thumbs.dreamstime.com/b/tres-postres-coloridos-de-gelatina-en-vasos-pl%C3%A1stico-transparente-aislados-blanco-un-tr%C3%ADo-vivos-verde-y-amarillo-se-presenta-390597475.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Postre'),  'Pastel de Chocolate',  'Pastel de chocolate con cobertura', 15.00, 25, 'https://www.renypicot.es/wp-content/uploads/2016/11/Cobertura-de-chocolate.-Tarta-de-chocolate.jpg');

-- /****************************/
-- orden (6)  (codigo_retiro UNIQUE)
-- Tip: pickup_at lo pongo relativo a now() para que sea válido cuando corras el script.
INSERT INTO public.orden (idusuario, idhorario, codigo_retiro, estado, pickup_at, notas, total) VALUES
((SELECT idusuario FROM public.usuarios WHERE email='kevin@correo.com'),
 (SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayuno'),
 'RET-1001', 'pagada', now() + interval '30 minutes', 'Sin cebolla', 20.00),

((SELECT idusuario FROM public.usuarios WHERE email='ana@correo.com'),
 (SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayuno'),
 'RET-1002', 'pendiente', now() + interval '45 minutes', NULL, 36.00),

((SELECT idusuario FROM public.usuarios WHERE email='luis@correo.com'),
 (SELECT idhorario FROM public.horarios WHERE tiempocomida='Almuerzo'),
 'RET-1003', 'en_preparacion', now() + interval '2 hours', 'Extra salsa', 35.00),

((SELECT idusuario FROM public.usuarios WHERE email='kevin@correo.com'),
 (SELECT idhorario FROM public.horarios WHERE tiempocomida='Almuerzo'),
 'RET-1004', 'lista', now() + interval '2 hours 15 minutes', NULL, 38.00),

((SELECT idusuario FROM public.usuarios WHERE email='ana@correo.com'),
 (SELECT idhorario FROM public.horarios WHERE tiempocomida='Cena'),
 'RET-1005', 'entregada', now() - interval '1 hour', 'Sin pepinillos', 30.00),

((SELECT idusuario FROM public.usuarios WHERE email='luis@correo.com'),
 (SELECT idhorario FROM public.horarios WHERE tiempocomida='Refaccion'),
 'RET-1006', 'cancelada', now() + interval '1 hour', 'Se canceló por falta de tiempo', 12.00);

-- /****************************/
-- detalle_orden (6)  (1 detalle por orden para que sean 6 exactos)
INSERT INTO public.detalle_orden (idorden, idplatillo, cantidad, precio_unitario, subtotal) VALUES
((SELECT idorden FROM public.orden WHERE codigo_retiro='RET-1001'),
 (SELECT idplatillo FROM public.platillos WHERE platillo='Desayuno Chapin'),
 1, 20.00, 20.00),

((SELECT idorden FROM public.orden WHERE codigo_retiro='RET-1002'),
 (SELECT idplatillo FROM public.platillos WHERE platillo='Panqueques'),
 2, 18.00, 36.00),

((SELECT idorden FROM public.orden WHERE codigo_retiro='RET-1003'),
 (SELECT idplatillo FROM public.platillos WHERE platillo='Pollo Asado'),
 1, 35.00, 35.00),

((SELECT idorden FROM public.orden WHERE codigo_retiro='RET-1004'),
 (SELECT idplatillo FROM public.platillos WHERE platillo='Carne Guisada'),
 1, 38.00, 38.00),

((SELECT idorden FROM public.orden WHERE codigo_retiro='RET-1005'),
 (SELECT idplatillo FROM public.platillos WHERE platillo='Hamburguesa'),
 1, 30.00, 30.00),

((SELECT idorden FROM public.orden WHERE codigo_retiro='RET-1006'),
 (SELECT idplatillo FROM public.platillos WHERE platillo='Licuado Banana'),
 1, 12.00, 12.00);

-- /****************************/
-- pagos (6) + facturas (6)
-- Hago 6 bloques CTE para amarrar idpago -> factura sin adivinar IDs.

WITH p AS (
  INSERT INTO public.pagos (idorden, metodo, estado, monto, referencia, pagado_at)
  VALUES ((SELECT idorden FROM public.orden WHERE codigo_retiro='RET-1001'),
          'tarjeta','aprobado',20.00,'VISA-0001', now())
  RETURNING idpago, monto
)
INSERT INTO public.facturas (idpago, serie, numero, nit, nombre, direccion, subtotal, impuesto, total, pdf_url)
SELECT idpago,'A','000001','CF','Kevin Mazar','Guatemala', monto, 0, monto, NULL FROM p;

WITH p AS (
  INSERT INTO public.pagos (idorden, metodo, estado, monto, referencia, pagado_at)
  VALUES ((SELECT idorden FROM public.orden WHERE codigo_retiro='RET-1002'),
          'efectivo','pendiente',36.00,NULL, NULL)
  RETURNING idpago, monto
)
INSERT INTO public.facturas (idpago, serie, numero, nit, nombre, direccion, subtotal, impuesto, total, pdf_url)
SELECT idpago,'A','000002','CF','Ana López','Guatemala', monto, 0, monto, NULL FROM p;

WITH p AS (
  INSERT INTO public.pagos (idorden, metodo, estado, monto, referencia, pagado_at)
  VALUES ((SELECT idorden FROM public.orden WHERE codigo_retiro='RET-1003'),
          'transferencia','aprobado',35.00,'ACH-88331', now())
  RETURNING idpago, monto
)
INSERT INTO public.facturas (idpago, serie, numero, nit, nombre, direccion, subtotal, impuesto, total, pdf_url)
SELECT idpago,'A','000003','CF','Luis Pérez','Guatemala', monto, 0, monto, NULL FROM p;

WITH p AS (
  INSERT INTO public.pagos (idorden, metodo, estado, monto, referencia, pagado_at)
  VALUES ((SELECT idorden FROM public.orden WHERE codigo_retiro='RET-1004'),
          'billetera','aprobado',38.00,'WALLET-77', now())
  RETURNING idpago, monto
)
INSERT INTO public.facturas (idpago, serie, numero, nit, nombre, direccion, subtotal, impuesto, total, pdf_url)
SELECT idpago,'A','000004','CF','Kevin Mazar','Guatemala', monto, 0, monto, NULL FROM p;

WITH p AS (
  INSERT INTO public.pagos (idorden, metodo, estado, monto, referencia, pagado_at)
  VALUES ((SELECT idorden FROM public.orden WHERE codigo_retiro='RET-1005'),
          'tarjeta','aprobado',30.00,'MC-1005', now() - interval '1 hour')
  RETURNING idpago, monto
)
INSERT INTO public.facturas (idpago, serie, numero, nit, nombre, direccion, subtotal, impuesto, total, pdf_url)
SELECT idpago,'A','000005','CF','Ana López','Guatemala', monto, 0, monto, NULL FROM p;

WITH p AS (
  INSERT INTO public.pagos (idorden, metodo, estado, monto, referencia, pagado_at)
  VALUES ((SELECT idorden FROM public.orden WHERE codigo_retiro='RET-1006'),
          'efectivo','reembolsado',12.00,'REF-1006', now())
  RETURNING idpago, monto
)
INSERT INTO public.facturas (idpago, serie, numero, nit, nombre, direccion, subtotal, impuesto, total, pdf_url)
SELECT idpago,'A','000006','CF','Luis Pérez','Guatemala', monto, 0, monto, NULL FROM p;

COMMIT;