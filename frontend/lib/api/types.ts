export type UserRole = "admin" | "cliente" | "cajero" | "cocina" | string;

export interface LoginRequest {
	identificador: string;
}

export interface UserSession {
	idusuario: number;
	idrol: number;
	rol: UserRole;
	nombre: string;
	email: string | null;
	carnet: string | null;
	telefono: string | null;
	activo: boolean;
}

export interface Platillo {
	idplatillo: number;
	idhorario: number | null;
	platillo: string;
	descripcion: string | null;
	precio: number;
	stock: number;
	imagen_url: string | null;
}

export interface Horario {
	idhorario: number;
	tiempocomida: string;
	hora_inicio: string;
	hora_fin: string;
	dias_semana: number[];
	activo: boolean;
	created_at: string;
}

export interface CartItem {
	idplatillo: number;
	nombre: string;
	precio: number;
	cantidad: number;
}

export interface CreateOrderItem {
	idplatillo: number;
	cantidad: number;
}

export interface CreateOrderPayload {
	idusuario: number;
	idhorario?: number | null;
	pickup_at?: string | null;
	notas?: string | null;
	items: CreateOrderItem[];
}

export interface Orden {
	idorden: number;
	idusuario: number;
	idhorario: number | null;
	codigo_retiro: string;
	estado: string;
	pickup_at: string | null;
	notas: string | null;
	total: number;
	created_at: string;
	updated_at: string;
}

export interface OrdenDetalle {
	iddetalleorden: number;
	idorden: number;
	idplatillo: number;
	cantidad: number;
	precio_unitario: number;
	subtotal: number;
	platillo?: string;
}

export interface CreateOrderResponse {
	orden: Orden;
	detalles: OrdenDetalle[];
}

export interface PagoPayload {
	idorden: number;
	metodo: "efectivo" | "tarjeta" | "transferencia" | "billetera";
	monto: number;
	referencia?: string | null;
}
