import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
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
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;

  async function loadQueue() {
    setLoading(true);
    try {
      const data = await getOperationalOrders();
      setOrders(data.filter((o) => o.estado !== "cancelada"));
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    logout();
    try {
      router.replace("/index");
    } catch {
      router.push("/");
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

  async function runBackAction(order: Orden) {
    const previous = previousState(order.estado);
    if (!previous) return;

    setActionOrderId(order.idorden);
    try {
      await updateOrderState(order.idorden, previous);
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

  function previousState(estado: string) {
    if (estado === "pagada") return "pendiente";
    if (estado === "en_preparacion") return "pagada";
    if (estado === "lista") return "en_preparacion";
    if (estado === "entregada") return "lista";
    return null;
  }

  function renderColumn(title: string, data: Orden[], emptyMessage: string, isSmallScreen: boolean) {
    const columnStyle = isSmallScreen 
      ? [styles.column, { width: "100%", height: 350 }]
      : [styles.column, { width: "49%", height: "49%" }];
    
    return (
      <View key={title} style={columnStyle}>
        <View style={styles.columnHeader}>
          <Text style={styles.columnTitle}>{title}</Text>
          <Text style={styles.columnCount}>{data.length}</Text>
        </View>

        <ScrollView style={styles.columnList} contentContainerStyle={styles.columnListContent}>
          {data.length === 0 ? (
            <View style={styles.emptyColumn}>
              <Text style={styles.emptyColumnText}>{emptyMessage}</Text>
            </View>
          ) : (
            data.map((order) => {
              const label = actionLabel(order);
              const canGoBack = previousState(order.estado) !== null;
              const processing = actionOrderId === order.idorden;
              return (
                <View key={order.idorden} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.code}>#{order.codigo_retiro}</Text>
                    <Text style={styles.meta}>{stateBadge(order)}</Text>
                  </View>
                  {order.usuario_nombre ? (
                    <Text style={styles.customerName}>{order.usuario_nombre}</Text>
                  ) : null}
                  <View style={styles.cardRow}>
                    <Text style={styles.meta}>Q{Number(order.total).toFixed(2)}</Text>
                    <View style={styles.actionsGroup}>
                      {canGoBack ? (
                        <Pressable style={styles.backAction} onPress={() => runBackAction(order)} disabled={processing}>
                          <Text style={styles.backActionText}>{processing ? "..." : "Regresar"}</Text>
                        </Pressable>
                      ) : null}
                      {label ? (
                        <Pressable style={styles.action} onPress={() => runAction(order)} disabled={processing}>
                          <Text style={styles.actionText}>{processing ? "..." : label}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.brandWrap}>
          <Text style={styles.brand}>UniFood</Text>
          <Text style={styles.subBrand}>Cafetería Universitaria</Text>
        </View>
        <View style={styles.topBarActions}>
          <View style={styles.userPill}>
            <Text style={styles.userName}>Hola, {user?.nombre ?? "Operador"}</Text>
            <Text style={styles.userSub}>{user?.email ?? "panel unificado"}</Text>
          </View>
          <Pressable
            style={styles.rolePill}
            onPress={handleLogout}
            hitSlop={10}
            android_ripple={{ color: "#fecaca" }}
          >
            <Text style={styles.roleText}>Salir</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View>
          <Text style={styles.title}>Panel Unificado</Text>
          <Text style={styles.count}>{orders.length} pedido(s) en total</Text>
        </View>
        <View style={styles.summaryActions}>
          <Pressable style={styles.refresh} onPress={loadQueue}>
            <Text style={styles.refreshText}>{loading ? "Actualizando..." : "Actualizar"}</Text>
          </Pressable>
          <Text style={styles.metrics}>
            {board.pendientes.length} pendiente(s)  •  {board.preparados.length} preparado(s)  •  {board.listos.length} listo(s)  •  {board.entregados.length} entregado(s)
          </Text>
        </View>
      </View>

      <ScrollView style={styles.board} contentContainerStyle={styles.boardContent}>
        <View style={styles.columnsGrid}>
          {renderColumn("Pendiente", board.pendientes, "Sin pedidos pendientes", isSmallScreen)}
          {renderColumn("Preparado", board.preparados, "Sin pedidos en preparación", isSmallScreen)}
          {renderColumn("Listo", board.listos, "Sin pedidos listos", isSmallScreen)}
          {renderColumn("Entregado", board.entregados, "Sin pedidos entregados", isSmallScreen)}
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandWrap: { flexShrink: 0 },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    justifyContent: "flex-end",
  },
  brand: { fontSize: 22, fontWeight: "800", color: "#0f172a" },
  subBrand: { fontSize: 13, color: "#64748b" },
  userPill: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 160,
    maxWidth: 440,
  },
  userName: { color: "#1e3a8a", fontWeight: "700", fontSize: 13 },
  userSub: { color: "#64748b", fontSize: 11 },
  rolePill: {
    backgroundColor: "#fee2e2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  roleText: { color: "#dc2626", fontWeight: "700", fontSize: 12 },
  summaryRow: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#dbe1e8",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "column",
    gap: 8,
  },
  title: { fontSize: 24, fontWeight: "800", color: "#0f172a" },
  count: { fontSize: 14, color: "#64748b", marginTop: 2 },
  summaryActions: { alignItems: "flex-end", gap: 6 },
  metrics: { color: "#64748b", fontSize: 13, textAlign: "right" },
  board: { flex: 1 },
  boardContent: { paddingHorizontal: 8, paddingVertical: 12, gap: 8 },
  refresh: { backgroundColor: "#1e63e9", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  refreshText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  columnsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  column: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dbe1e8",
    borderRadius: 8,
    padding: 8,
    gap: 6,
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 4,
    marginBottom: 4,
  },
  columnTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  columnCount: {
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    minWidth: 24,
    textAlign: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontWeight: "700",
    color: "#334155",
    fontSize: 12,
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
  columnList: { flex: 1 },
  columnListContent: { gap: 6, paddingBottom: 2 },
  card: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dbe1e8",
    padding: 8,
    flexDirection: "column",
    gap: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  code: { fontWeight: "800", fontSize: 14, color: "#0f172a", flex: 1 },
  customerName: { fontSize: 13, fontWeight: "600", color: "#1e3a8a", marginBottom: 2 },
  meta: { color: "#64748b", fontSize: 12 },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  actionsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  backAction: {
    backgroundColor: "#e2e8f0",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backActionText: { color: "#334155", fontWeight: "700", fontSize: 12 },
  action: { backgroundColor: "#1e63e9", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
