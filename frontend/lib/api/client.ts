import {
	CreateOrderPayload,
	CreateOrderResponse,
	LoginRequest,
	Horario,
	Orden,
	PagoPayload,
	Platillo,
	UserSession,
} from "./types";
import Constants from "expo-constants";
import { Platform } from "react-native";

function resolveApiUrl(): string {
	const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
	if (envApiUrl) {
		return envApiUrl;
	}

	if (Platform.OS === "web" && typeof window !== "undefined") {
		return `${window.location.protocol}//${window.location.hostname}:8000`;
	}

	const expoHostUri =
		(Constants.expoConfig as { hostUri?: string } | null)?.hostUri ??
		(Constants as unknown as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost;

	if (expoHostUri) {
		const host = expoHostUri.split(":")[0];
		return `http://${host}:8000`;
	}

	return "http://localhost:8000";
}

const API_URL = resolveApiUrl();

async function request<T>(path: string, options?: RequestInit): Promise<T> {
	const response = await fetch(`${API_URL}${path}`, {
		headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
		...options,
	});

	if (!response.ok) {
		let message = `Error ${response.status}`;
		try {
			const data = (await response.json()) as { detail?: string };
			if (data?.detail) message = data.detail;
		} catch {
			message = response.statusText || message;
		}
		throw new Error(message);
	}

	if (response.status === 204) {
		return {} as T;
	}

	return (await response.json()) as T;
}

export async function login(payload: LoginRequest): Promise<UserSession> {
	return request<UserSession>("/auth/login", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export async function getPlatillos(): Promise<Platillo[]> {
	return request<Platillo[]>("/platillos");
}

export async function getHorarios(): Promise<Horario[]> {
	return request<Horario[]>("/horarios");
}

export async function createOrder(payload: CreateOrderPayload): Promise<CreateOrderResponse> {
	return request<CreateOrderResponse>("/ordenes", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export async function getOrdersByUser(idusuario: number): Promise<Orden[]> {
	return request<Orden[]>(`/ordenes?idusuario=${idusuario}`);
}

export async function getKitchenQueue(): Promise<Orden[]> {
	return request<Orden[]>("/cocina/cola");
}

export async function getOperationalOrders(): Promise<Orden[]> {
	return request<Orden[]>("/ordenes");
}

export async function getPendingOrders(): Promise<Orden[]> {
	return request<Orden[]>("/ordenes?estado=pendiente");
}

export async function approveOrderPayment(payload: PagoPayload): Promise<{ orden_actualizada: Orden | null }> {
	return request<{ orden_actualizada: Orden | null }>("/pagos", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export async function updateOrderState(idorden: number, estado: string): Promise<Orden> {
	return request<Orden>(`/ordenes/${idorden}/estado`, {
		method: "PATCH",
		body: JSON.stringify({ estado }),
	});
}
