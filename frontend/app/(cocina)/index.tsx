import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { approveOrderPayment, getOperationalOrders, updateOrderState } from "@/lib/api/client";
import { useAppStore } from "@/lib/store/app-store";
import { Orden } from "@/lib/api/types";

export default function CocinaScreen() {
  const user = useAppStore((state) => state.user);
  const logout = useAppStore((state) => state.logout);
  const [orders, setOrders] = useState<Orden[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionOrderId, setActionOrderId] = useState<number | null>(null);

  async function loadQueue() {
    setLoading(true);
    try {
      const data = await getOperationalOrders();
      setOrders(data.filter((o) => o.estado !== "cancelada"));
    } finally {
      setLoading(false);
    }
  }

  async function runAction(order: Orden) {
    setActionOrderId(order.idorden);
    try {
      if (order.estado === "pendiente") {
        await approveOrderPayment({
          idorden: order.idorden,
          metodo: "efectivo",
          monto: Number(order.total),
          referencia: `CAJA-${order.codigo_retiro}`,
        });
      } else if (order.estado === "pagada") {
        await updateOrderState(order.idorden, "en_preparacion");
      } else if (order.estado === "en_preparacion") {
        await updateOrderState(order.idorden, "lista");
      } else if (order.estado === "lista") {
        await updateOrderState(order.idorden, "entregada");
      }
      await loadQueue();
    } finally {
      setActionOrderId(null);
    }
  }

  useEffect(() => {
    loadQueue();
  }, []);

  const board = useMemo(() => {
    const pendientes = orders.filter((o) => o.estado === "pendiente" || o.estado === "pagada");
    const preparados = orders.filter((o) => o.estado === "en_preparacion");
    const listos = orders.filter((o) => o.estado === "lista");
    const entregados = orders.filter((o) => o.estado === "entregada");

    return {
      pendientes,
      preparados,
      listos,
      entregados,
    };
  }, [orders]);

  function actionLabel(order: Orden) {
    if (order.estado === "pendiente") return "Aprobar pago";
    if (order.estado === "pagada") return "Iniciar preparación";
    if (order.estado === "en_preparacion") return "Marcar listo";
    if (order.estado === "lista") return "Marcar entregado";
    return null;
  }

  function stateBadge(order: Orden) {
    if (order.estado === "pendiente") return "Pendiente pago";
    if (order.estado === "pagada") return "Pendiente cocina";
    if (order.estado === "en_preparacion") return "Preparado";
    if (order.estado === "lista") return "Listo";
    return "Entregado";
  }

  function renderColumn(title: string, data: Orden[], emptyMessage: string) {
    return (
      <View style={styles.column}>
        <View style={styles.columnHeader}>
          <Text style={styles.columnTitle}>{title}</Text>
          <Text style={styles.columnCount}>{data.length}</Text>
        </View>

        {data.length === 0 ? (
          <View style={styles.emptyColumn}>
            <Text style={styles.emptyColumnText}>{emptyMessage}</Text>
          </View>
        ) : (
          data.map((order) => {
            const label = actionLabel(order);
            const processing = actionOrderId === order.idorden;
            return (
              <View key={order.idorden} style={styles.card}>
                <Text style={styles.code}>#{order.codigo_retiro}</Text>
                <Text style={styles.meta}>Estado: {stateBadge(order)}</Text>
                <Text style={styles.meta}>Total: Q{Number(order.total).toFixed(2)}</Text>
                {label ? (
                  <Pressable style={styles.action} onPress={() => runAction(order)} disabled={processing}>
                    <Text style={styles.actionText}>{processing ? "Procesando..." : label}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>UniFood</Text>
          <Text style={styles.subBrand}>Cafetería Universitaria</Text>
        </View>
        <View style={styles.userPill}>
          <Text style={styles.userName}>Hola, {user?.nombre ?? "Operador"}</Text>
          <Text style={styles.userSub}>{user?.email ?? "panel unificado"}</Text>
        </View>
        <Pressable
          style={styles.rolePill}
          onPress={() => {
            logout();
            router.replace("/");
          }}
        >
          <Text style={styles.roleText}>Salir</Text>
        </Pressable>
      </View>

      <View style={styles.summaryRow}>
        <View>
          <Text style={styles.title}>Panel Unificado</Text>
          <Text style={styles.count}>{orders.length} pedido(s) en total</Text>
        </View>
        <Text style={styles.metrics}>
          {board.pendientes.length} pendiente(s)  •  {board.preparados.length} preparado(s)  •  {board.listos.length} listo(s)  •  {board.entregados.length} entregado(s)
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.board}>
        <Pressable style={styles.refresh} onPress={loadQueue}>
          <Text style={styles.refreshText}>{loading ? "Actualizando..." : "Actualizar"}</Text>
        </Pressable>
        <View style={styles.columnsGrid}>
          {renderColumn("Pendiente", board.pendientes, "Sin pedidos pendientes")}
          {renderColumn("Preparado", board.preparados, "Sin pedidos en preparación")}
          {renderColumn("Listo", board.listos, "Sin pedidos listos")}
          {renderColumn("Entregado", board.entregados, "Sin pedidos entregados")}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  topBar: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#dbe1e8",
    paddingHorizontal: 22,
    paddingVertical: 16,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  brand: { fontSize: 26, fontWeight: "800", color: "#0f172a" },
  subBrand: { fontSize: 16, color: "#64748b" },
  userPill: {
    marginLeft: "auto",
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  userName: { color: "#1e3a8a", fontWeight: "700", fontSize: 14 },
  userSub: { color: "#64748b", fontSize: 12 },
  rolePill: { backgroundColor: "#fee2e2", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  roleText: { color: "#dc2626", fontWeight: "700" },
  summaryRow: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#dbe1e8",
    paddingHorizontal: 22,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  title: { fontSize: 30, fontWeight: "800", color: "#0f172a" },
  count: { fontSize: 16, color: "#64748b", marginTop: 4 },
  metrics: { color: "#64748b", fontSize: 16 },
  board: { padding: 16, gap: 12 },
  refresh: { alignSelf: "flex-end", backgroundColor: "#1e63e9", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  refreshText: { color: "#fff", fontWeight: "700" },
  columnsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-start",
  },
  column: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dbe1e8",
    borderRadius: 10,
    padding: 10,
    width: "49%",
    minWidth: 320,
    gap: 8,
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 6,
  },
  columnTitle: { fontSize: 20, fontWeight: "800", color: "#0f172a" },
  columnCount: {
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    minWidth: 26,
    textAlign: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontWeight: "700",
    color: "#334155",
  },
  emptyColumn: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  emptyColumnText: { textAlign: "center", color: "#94a3b8" },
  card: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dbe1e8",
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  code: { fontWeight: "800", fontSize: 18, color: "#0f172a" },
  meta: { color: "#64748b", marginTop: 2 },
  action: { backgroundColor: "#1e63e9", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10 },
  actionText: { color: "#fff", fontWeight: "700" },
});
