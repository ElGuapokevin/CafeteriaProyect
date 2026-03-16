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
  nombre      VARCHAR(150),
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

-- ========================================================
-- 1. HORARIOS (7 días de la semana)
-- ========================================================
TRUNCATE TABLE public.platillos CASCADE;
TRUNCATE TABLE public.horarios CASCADE;

INSERT INTO public.horarios (tiempocomida, hora_inicio, hora_fin, dias_semana, activo) VALUES 
('Desayunos', '07:00', '11:00', ARRAY[1,2,3,4,5,6,7], true),
('Almuerzos', '12:00', '16:00', ARRAY[1,2,3,4,5,6,7], true),
('Bebidas',   '07:00', '21:00', ARRAY[1,2,3,4,5,6,7], true),
('Postres',   '10:00', '21:00', ARRAY[1,2,3,4,5,6,7], true);


-- ========================================================
-- 2. PLATILLOS (Con tus links originales)
-- ========================================================
INSERT INTO public.platillos (idhorario, platillo, descripcion, precio, stock, imagen_url) VALUES 

-- CATEGORÍA: DESAYUNOS
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayunos'), 'Desayuno Chapín', 'Huevos + frijol + plátano', 20.00, 50, 'https://imagenes.gozeri.com/productos/1742784712.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayunos'), 'Panqueques', 'Panqueques con miel', 18.00, 30, 'https://facilycasero.com/wp-content/uploads/2020/07/Pancakes-without-Milk-post-1.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayunos'), 'Empanada', 'Empanada de carne', 10.00, 30, 'https://familiakitchen.com/wp-content/uploads/2021/09/Empanadas-open-e1631296397215.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayunos'), 'Tostadas', 'Tostadas con frijol y queso', 6.00, 30, 'https://www.shutterstock.com/image-photo/guatemalan-mexican-antojito-made-crispy-260nw-1694648479.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayunos'), 'Panes de Chile Relleno', 'Chiles rellenos de carne', 10.00, 20, 'https://media-cdn.tripadvisor.com/media/photo-s/0f/91/da/a5/pan-con-chile-relleno.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayunos'), 'Nachos con Queso', 'Nachos con queso y carne', 15.00, 40, 'https://i.ytimg.com/vi/d6n4ziresl0/maxresdefault.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayunos'), 'Tacos', 'Tres tacos de carne', 20.00, 35, 'https://danosseasoning.com/wp-content/uploads/2022/03/Beef-Tacos-1024x767.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayunos'), 'Panes con Carne', 'Pan artesanal con carne', 15.00, 30, 'https://cdn0.recetasgratis.net/es/posts/4/3/9/baguette_de_carne_de_res_58934_orig.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Desayunos'), 'Papas Fritas', 'Porción de papas fritas', 12.00, 50, 'https://pbs.twimg.com/media/EiyFniyU0AI994D.jpg'),

-- CATEGORÍA: BEBIDAS
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Bebidas'), 'Licuado de Banana', 'Licuado natural', 12.00, 60, 'https://imag.bonviveur.com/batido-de-platano-foto-cerca.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Bebidas'), 'Coca Cola', 'Gaseosa original', 8.00, 60, 'https://i5.walmartimages.com/asr/950f0dce-c71e-4d48-b03c-b6c5cacdb9cf.a30e1c1e700c2a3261ba3b0babf7b1e5.jpeg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Bebidas'), 'Agua Pura', 'Botella 600ml', 5.00, 100, 'https://salvavidasenlinea.com.gt/wp-content/uploads/2022/07/28000316_600-Ml-Sc-12-Unidades_Linea-APS.png'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Bebidas'), 'Agua Mineral', 'Agua con gas', 7.00, 80, 'https://cielitos.com.gt/wp-content/uploads/2024/03/mineral.png'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Bebidas'), 'Shaca Laca', 'Bebida de leche', 10.00, 50, 'https://idealsa.com/wp-content/uploads/2022/06/Bodegon-Shakalaka-1.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Bebidas'), 'Jugo Del Valle', 'Sabor néctar', 8.00, 70, 'https://www.coca-cola.com/content/dam/onexp/gt/es/brands/del-valle/es_del%20valle_prod_fresh-citricos_750x750_v1.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Bebidas'), 'Pepsi', 'Lata fría', 8.00, 60, 'https://comprabien.net/wp-content/uploads/bebidas-pepsi-lata.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Bebidas'), 'Café', 'Café caliente', 10.00, 40, 'https://previews.123rf.com/images/kurapy11/kurapy111407/kurapy11140700035/29766353-a-paper-cup-of-black-coffee-and-coffee-beans-on-wooden-table.jpg'),

-- CATEGORÍA: ALMUERZOS
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Almuerzos'), 'Pollo Asado', 'Pollo con acompañamiento', 35.00, 40, 'https://live.staticflickr.com/3074/2647473491_db3a8111df_b.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Almuerzos'), 'Carne Guisada', 'Receta tradicional', 38.00, 35, 'https://es.riverheadlocal.com/wp-content/uploads/2018/06/2018_0623_carne_guisada.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Almuerzos'), 'Hamburguesa', 'Hamburguesa con Papas', 30.00, 25, 'https://static.vecteezy.com/system/resources/thumbnails/070/327/872/small/a-hamburger-with-cheese-lettuce-and-onions-photo.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Almuerzos'), 'Carne Asada', 'Carne Asada con acompañamiento', 25.00, 30, 'https://nibblesandfeasts.com/wp-content/uploads/2025/05/Carne-Asada-1.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Almuerzos'), 'Pizza', 'Pizza artesanal', 40.00, 20, 'https://assets.surlatable.com/m/15a89c2d9c6c1345/72_dpi_webp-REC-283110_Pizza-jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Almuerzos'), 'Burritos', 'Burrito relleno', 30.00, 15, 'https://assets.tmecosys.com/image/upload/t_web_rdp_recipe_584x480_1_5x/img/recipe/ras/Assets/9B350F25-7E38-4E9E-BA8C-1B0B8E1ED6F6/Derivates/a8be9735-95a8-4720-b32a-deabfe765f1a.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Almuerzos'), 'Chalupas', 'Orden de chalupas', 25.00, 15, 'https://topsecretrecipes.com/images/product/taco-bell-chalupa-supreme-copycat-recipe.jpg'),

-- CATEGORÍA: POSTRES
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Postres'), 'Flan', 'Flan de leche horneado', 9.00, 30, 'https://bitesbybianca.com/wp-content/uploads/2024/12/filipino-leche-flan-cover-1-500x500.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Postres'), 'Gelatina', 'Gelatina mosaico', 5.00, 50, 'https://peopleenespanol.com/thmb/HcqiwY56MChjmdzmc9_iFIoRmzE=/1500x0/filters:no_upscale():max_bytes(150000):strip_icc()/gelatina-mosaico-2000-83b273ebdd154042a00734b72ec0e576.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Postres'), 'Pastel ', 'Pastel de chocolate', 15.00, 25, 'https://nuss.com.gt/wp-content/uploads/2025/07/nuss-2506003-pastel-de-chocolate-sin-gluten-sin-azcar-sin-lactosa-sin-nueces-1.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Postres'), 'Donas', 'Dona decorada', 7.00, 40, 'https://www.clarin.com/2021/06/02/H1ey_pHHt_0x750__1.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Postres'), 'Fruta Picada', 'Vaso de fruta fresca', 12.00, 30, 'https://t3.ftcdn.net/jpg/00/88/34/74/360_F_88347497_UIbtGCNpBvyP7xsk7tyeygaUq7U0ARWV.jpg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Postres'), 'Choco Bananos', 'Banano frío con chocolate', 5.00, 50, 'https://www.196flavors.com/wp-content/uploads/2020/08/chocobananos-1-FP.jpeg'),
((SELECT idhorario FROM public.horarios WHERE tiempocomida='Postres'), 'Helado', 'Cono de vainilla', 10.00, 20, 'https://www.shutterstock.com/image-photo/vanilla-ice-cream-scoops-waffle-600nw-2661431663.jpg');
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
 (SELECT idplatillo FROM public.platillos WHERE platillo='Desayuno Chapín'),
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
 (SELECT idplatillo FROM public.platillos WHERE platillo='Licuado de Banana'),
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