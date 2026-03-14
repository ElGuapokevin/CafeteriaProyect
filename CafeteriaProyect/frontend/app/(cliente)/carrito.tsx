import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { createOrder } from "@/lib/api/client";
import { useAppStore } from "@/lib/store/app-store";

export default function CarritoScreen() {
  const user = useAppStore((state) => state.user);
  const cart = useAppStore((state) => state.cart);
  const removeFromCart = useAppStore((state) => state.removeFromCart);
  const clearCart = useAppStore((state) => state.clearCart);
  const setLastOrder = useAppStore((state) => state.setLastOrder);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const canConfirm = Boolean(user) && cart.length > 0 && !loading;

  const total = useMemo(
    () => cart.reduce((acc, item) => acc + item.precio * item.cantidad, 0),
    [cart],
  );

  useEffect(() => {
    if (!user) {
      setError("Tu sesión expiró. Inicia sesión nuevamente.");
    }
  }, [user]);

  async function confirmarPedido() {
    if (!user) {
      setError("Tu sesión expiró. Inicia sesión nuevamente.");
      router.replace("/");
      return;
    }
    if (cart.length === 0 || loading) return;
    setError(null);
    setLoading(true);
    try {
      const response = await createOrder({
        idusuario: user.idusuario,
        notas: null,
        items: cart.map((item) => ({ idplatillo: item.idplatillo, cantidad: item.cantidad })),
      });
      setLastOrder(response.orden);
      clearCart();
      setConfirmed(true);
    } catch (apiError) {
      const message = apiError instanceof Error ? apiError.message : "No se pudo confirmar el pedido";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Carrito</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {cart.map((item) => (
          <View key={item.idplatillo} style={styles.item}>
            <View>
              <Text style={styles.name}>{item.nombre}</Text>
              <Text style={styles.meta}>Cantidad: {item.cantidad}</Text>
              <Text style={styles.meta}>Subtotal: Q{(item.precio * item.cantidad).toFixed(2)}</Text>
            </View>
            <Pressable onPress={() => removeFromCart(item.idplatillo)}>
              <Text style={styles.remove}>Quitar</Text>
            </Pressable>
          </View>
        ))}

        {cart.length === 0 ? <Text style={styles.empty}>Tu carrito está vacío</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.total}>Total: Q{total.toFixed(2)}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {confirmed ? (
          <View style={styles.actionsRow}>
            <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => router.replace("/(cliente)/menu")}>
              <Text style={styles.secondaryButtonText}>Salir de carrito</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={() => router.push("/(cliente)/seguimiento")}>
              <Text style={styles.buttonText}>Ver historial</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.button, !canConfirm && styles.buttonDisabled]}
            disabled={!canConfirm}
            onPress={confirmarPedido}
          >
            <Text style={styles.buttonText}>{loading ? "Enviando..." : "Confirmar pedido"}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9", padding: 20 },
  title: { fontSize: 32, fontWeight: "800", color: "#0f172a", marginBottom: 12 },
  list: { gap: 10, paddingBottom: 20 },
  item: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dbe1e8",
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  meta: { color: "#64748b", marginTop: 2 },
  remove: { color: "#dc2626", fontWeight: "700" },
  empty: { textAlign: "center", marginTop: 30, color: "#64748b", fontSize: 16 },
  footer: { borderTopWidth: 1, borderTopColor: "#dbe1e8", paddingTop: 14, gap: 8 },
  total: { fontSize: 24, fontWeight: "800", color: "#0f172a" },
  error: { color: "#dc2626" },
  button: { backgroundColor: "#1e63e9", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonDisabled: { backgroundColor: "#94a3b8" },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  actionsRow: { flexDirection: "row", gap: 10 },
  secondaryButton: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1" },
  secondaryButtonText: { color: "#1f2937", fontSize: 16, fontWeight: "700" },
});
