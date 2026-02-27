import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getOrdersByUser } from "@/lib/api/client";
import { Orden } from "@/lib/api/types";
import { useAppStore } from "@/lib/store/app-store";

export default function SeguimientoScreen() {
  const user = useAppStore((state) => state.user);
  const lastOrder = useAppStore((state) => state.lastOrder);
  const [orders, setOrders] = useState<Orden[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getOrdersByUser(user.idusuario);
      setOrders(data);
    } catch (apiError) {
      const message = apiError instanceof Error ? apiError.message : "No se pudo cargar seguimiento";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Seguimiento</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.refresh} onPress={loadOrders}>
            <Text style={styles.refreshText}>Actualizar</Text>
          </Pressable>
          <Pressable style={styles.backMenu} onPress={() => router.replace("/(cliente)/menu")}>
            <Text style={styles.backMenuText}>Salir a menú</Text>
          </Pressable>
        </View>
      </View>

      {lastOrder ? (
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Tu código de retiro</Text>
          <Text style={styles.code}>{lastOrder.codigo_retiro}</Text>
          <Text style={styles.codeHint}>Estado inicial: pendiente de pago</Text>
        </View>
      ) : null}

      {loading ? <Text style={styles.info}>Cargando órdenes...</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView contentContainerStyle={styles.list}>
        {orders.map((order) => (
          <View key={order.idorden} style={styles.orderCard}>
            <Text style={styles.orderCode}>#{order.codigo_retiro}</Text>
            <Text style={styles.orderMeta}>Estado: {order.estado}</Text>
            <Text style={styles.orderMeta}>Total: Q{Number(order.total).toFixed(2)}</Text>
          </View>
        ))}
        {orders.length === 0 && !loading ? <Text style={styles.info}>No hay órdenes todavía</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9", padding: 20 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerActions: { flexDirection: "row", gap: 8 },
  title: { fontSize: 32, fontWeight: "800", color: "#0f172a" },
  refresh: { backgroundColor: "#1e63e9", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  refreshText: { color: "#fff", fontWeight: "700" },
  backMenu: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  backMenuText: { color: "#1f2937", fontWeight: "700" },
  codeCard: { marginTop: 14, backgroundColor: "#dbeafe", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#93c5fd" },
  codeLabel: { color: "#1e3a8a", fontWeight: "700" },
  code: { color: "#1e3a8a", fontSize: 28, fontWeight: "900", marginTop: 2 },
  codeHint: { color: "#1d4ed8", marginTop: 2 },
  info: { textAlign: "center", marginTop: 16, color: "#64748b" },
  error: { textAlign: "center", marginTop: 16, color: "#dc2626" },
  list: { gap: 10, paddingTop: 12, paddingBottom: 22 },
  orderCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#dbe1e8", borderRadius: 10, padding: 12 },
  orderCode: { fontWeight: "800", fontSize: 20, color: "#0f172a" },
  orderMeta: { color: "#475569", marginTop: 4 },
});
