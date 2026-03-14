import { useEffect, useMemo, useState } from "react";
import { Animated, Image, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { createOrder, getHorarios, getOrdersByUser, getPlatillos } from "@/lib/api/client";
import { Horario, Orden, Platillo } from "@/lib/api/types";
import { useAppStore } from "@/lib/store/app-store";

type Category = "Todos" | "Desayunos" | "Bebidas" | "Almuerzos" | "Postres";

const categories: Category[] = ["Todos", "Desayunos", "Bebidas", "Almuerzos", "Postres"];

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesCategory(product: Platillo, category: Category, horarioName?: string): boolean {
  if (category === "Todos") return true;

  const horario = normalize(horarioName ?? "");
  const text = normalize(`${product.platillo} ${product.descripcion ?? ""}`);

  if (category === "Desayunos") {
    return horario.includes("desayuno") || text.includes("desayuno") || text.includes("panque") || text.includes("huevo");
  }
  if (category === "Bebidas") {
    return (
      horario.includes("refaccion") ||
      horario.includes("bebida") ||
      text.includes("licuado") ||
      text.includes("jugo") ||
      text.includes("cafe") ||
      text.includes("te")
    );
  }
  if (category === "Almuerzos") {
    return horario.includes("almuerzo") || horario.includes("cena") || text.includes("pollo") || text.includes("carne");
  }
  return horario.includes("postre") || text.includes("postre") || text.includes("pastel");
}

export default function MenuScreen() {
  const [products, setProducts] = useState<Platillo[]>([]);
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category>("Todos");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [cartVisible, setCartVisible] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [activeOrders, setActiveOrders] = useState<Orden[]>([]);
  const [selectAnim] = useState(() => new Animated.Value(0));
  const { width, height } = useWindowDimensions();
  const addToCart = useAppStore((state) => state.addToCart);
  const removeFromCart = useAppStore((state) => state.removeFromCart);
  const clearCart = useAppStore((state) => state.clearCart);
  const setLastOrder = useAppStore((state) => state.setLastOrder);
  const cart = useAppStore((state) => state.cart);
  const user = useAppStore((state) => state.user);
  const logout = useAppStore((state) => state.logout);
  const total = useMemo(() => cart.reduce((acc, item) => acc + item.precio * item.cantidad, 0), [cart]);
  const isPhone = width < 768;
  const cartPanelWidth = isPhone ? Math.max(320, width - 20) : Math.max(390, Math.floor(width * 0.32));
  const cartPanelHeight = isPhone ? Math.max(300, Math.floor(height * 0.42)) : Math.max(380, Math.floor(height * 0.66));

  async function loadLatestOrderStatus(userId: number) {
    try {
      const orders = await getOrdersByUser(userId);
      const sorted = [...orders].sort(
        (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      );
      setActiveOrders(sorted.filter((order) => order.estado !== "entregada" && order.estado !== "cancelada"));
    } catch {
      setActiveOrders([]);
    }
  }

  function statusText(estado: string) {
    if (estado === "pendiente") return "Pendiente de pago";
    if (estado === "pagada") return "Pagado, pendiente de cocina";
    if (estado === "en_preparacion") return "En preparación";
    if (estado === "lista") return "Listo para recoger";
    if (estado === "entregada") return "Entregado";
    return "Cancelado";
  }

  function animateSelection(productId: number) {
    setSelectedProductId(productId);
    selectAnim.setValue(0);
    Animated.sequence([
      Animated.timing(selectAnim, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(selectAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSelectedProductId(null);
    });
  }

  async function confirmarPedido() {
    if (!user || cart.length === 0 || confirming) return;
    setConfirming(true);
    setConfirmMessage(null);
    try {
      const response = await createOrder({
        idusuario: user.idusuario,
        notas: null,
        items: cart.map((item) => ({ idplatillo: item.idplatillo, cantidad: item.cantidad })),
      });
      setLastOrder(response.orden);
      clearCart();
      setConfirmMessage(`Pedido confirmado. Código: ${response.orden.codigo_retiro}`);
      if (user) {
        await loadLatestOrderStatus(user.idusuario);
      }
      setCartVisible(true);
    } catch (apiError) {
      const message = apiError instanceof Error ? apiError.message : "No se pudo confirmar pedido";
      setConfirmMessage(message);
    } finally {
      setConfirming(false);
    }
  }

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const [platillos, horariosData] = await Promise.all([getPlatillos(), getHorarios()]);
        if (mounted) {
          setProducts(platillos);
          setHorarios(horariosData);
        }
      } catch (apiError) {
        const message = apiError instanceof Error ? apiError.message : "No se pudo cargar menú";
        if (mounted) setError(message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    loadLatestOrderStatus(user.idusuario);
    const intervalId = setInterval(() => {
      loadLatestOrderStatus(user.idusuario);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [user]);

  const filtered = useMemo(() => {
    const horariosById = new Map(horarios.map((h) => [h.idhorario, h.tiempocomida]));

    const byCategory = products.filter((item) =>
      matchesCategory(item, selectedCategory, item.idhorario ? horariosById.get(item.idhorario) : undefined),
    );

    const value = query.trim().toLowerCase();
    if (!value) return byCategory;
    return byCategory.filter((item) =>
      `${item.platillo} ${item.descripcion ?? ""}`.toLowerCase().includes(value),
    );
  }, [products, horarios, selectedCategory, query]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>UniFood</Text>
          <Text style={styles.subBrand}>Cafetería Universitaria</Text>
        </View>
        <View style={styles.badgeRow}>
          <View style={styles.userBadge}>
            <Text style={styles.userName}> {user?.nombre ?? "Usuario"}</Text>
          </View>
          {!isPhone ? (
            <Pressable style={[styles.cartBadge, cartVisible && styles.cartBadgeActive]} onPress={() => setCartVisible((value) => !value)}>
              <Text style={[styles.cartText, cartVisible && styles.cartTextActive]}>
                {cartVisible ? "Ocultar carrito" : "Ver carrito"} ({cart.reduce((acc, item) => acc + item.cantidad, 0)})
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.logoutBadge}
            onPress={() => {
              logout();
              router.replace("/");
            }}
          >
            <Text style={styles.logoutText}>Salir</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.progressWrap}>
        <Text style={styles.progressTitle}>Proceso de tus pedidos</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.progressList}>
          {activeOrders.length === 0 ? (
            <View style={styles.progressEmpty}>
              <Text style={styles.progressEmptyText}>No tienes pedidos en proceso</Text>
            </View>
          ) : (
            activeOrders.map((order) => (
              <View
                key={order.idorden}
                style={[
                  styles.progressCard,
                  order.estado === "pendiente" && styles.progressPending,
                  order.estado === "pagada" && styles.progressPaid,
                  order.estado === "en_preparacion" && styles.progressPreparing,
                  order.estado === "lista" && styles.progressReady,
                ]}
              >
                <Text style={styles.progressCode}>Pedido #{order.idorden}</Text>
                <Text
                  style={[
                    styles.progressStatus,
                    order.estado === "pendiente" && styles.progressPendingText,
                    order.estado === "pagada" && styles.progressPaidText,
                    order.estado === "en_preparacion" && styles.progressPreparingText,
                    order.estado === "lista" && styles.progressReadyText,
                  ]}
                >
                  {statusText(order.estado)}
                </Text>
                <Text style={styles.progressUser}>Solicita: {user?.nombre ?? "Usuario"}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {isPhone ? (
        <View style={styles.phoneFilterWrap}>
          <Pressable style={styles.phoneFilterTrigger} onPress={() => setFilterOpen((value) => !value)}>
            <Text style={styles.phoneFilterLabel}>Filtro: {selectedCategory}</Text>
            <Text style={styles.phoneFilterArrow}>{filterOpen ? "▲" : "▼"}</Text>
          </Pressable>
          {filterOpen ? (
            <View style={styles.phoneFilterMenu}>
              {categories.map((category) => (
                <Pressable
                  key={category}
                  style={[styles.phoneFilterOption, selectedCategory === category && styles.phoneFilterOptionActive]}
                  onPress={() => {
                    setSelectedCategory(category);
                    setFilterOpen(false);
                  }}
                >
                  <Text style={[styles.phoneFilterOptionText, selectedCategory === category && styles.phoneFilterOptionTextActive]}>
                    {category}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.categoryRow}>
          {categories.map((category) => (
            <Pressable
              key={category}
              style={[styles.category, selectedCategory === category && styles.categoryActive]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text style={[styles.categoryText, selectedCategory === category && styles.categoryTextActive]}>{category}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <TextInput
        style={styles.search}
        placeholder="Buscar en el menu..."
        placeholderTextColor="#64748b"
        value={query}
        onChangeText={setQuery}
      />

      {loading ? <Text style={styles.info}>Cargando menú...</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView
        contentContainerStyle={[
          styles.grid,
          {
            paddingBottom: isPhone ? (cartVisible ? cartPanelHeight + 30 : 96) : 40,
            paddingRight: !isPhone && cartVisible ? cartPanelWidth + 26 : 20,
          },
        ]}
      >
        {filtered.map((product) => (
          <Animated.View
            key={product.idplatillo}
            style={[
              styles.card,
              isPhone && styles.cardPhone,
              selectedProductId === product.idplatillo && {
                transform: [
                  {
                    scale: selectAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.035],
                    }),
                  },
                ],
              },
            ]}
          >
<View style={[styles.photo, isPhone && styles.photoPhone]}>
  {product.imagen_url ? (
    <Image 
      source={{ uri: product.imagen_url }} 
      style={{ width: '100%', height: '100%', borderRadius: 8 }} 
      resizeMode="cover"
    />
  ) : (
    <Text style={styles.photoText}>Sin Imagen</Text>
  )}
</View>
            <View style={styles.cardBody}>
              <View style={styles.cardHead}>
                <Text style={[styles.name, isPhone && styles.namePhone]}>{product.platillo}</Text>
                <Text style={[styles.price, isPhone && styles.pricePhone]}>Q{Number(product.precio).toFixed(0)}</Text>
              </View>
              <Text style={styles.desc}>{product.descripcion ?? "Sin descripción"}</Text>
              <Pressable
                style={[styles.addButton, isPhone && styles.addButtonPhone]}
                onPress={() => {
                  animateSelection(product.idplatillo);
                  addToCart({
                    idplatillo: product.idplatillo,
                    nombre: product.platillo,
                    precio: Number(product.precio),
                  });
                }}
              >
                <Text style={[styles.addText, isPhone && styles.addTextPhone]}>+ Agregar</Text>
              </Pressable>
            </View>
          </Animated.View>
        ))}
      </ScrollView>

      {cartVisible ? (
        <View
          style={[
            styles.fixedCart,
            isPhone ? styles.fixedCartPhone : styles.fixedCartDesktop,
            { width: cartPanelWidth, height: cartPanelHeight },
          ]}
        >
          <View style={styles.cartHeader}>
            <Text style={styles.cartTitle}>👜  Tu Pedido</Text>
            <View style={styles.cartHeaderRight}>
              <Text style={styles.cartCount}>{cart.reduce((acc, item) => acc + item.cantidad, 0)} ítem(s)</Text>
              {isPhone ? (
                <Pressable onPress={() => setCartVisible(false)}>
                  <Text style={styles.closeCartText}>✕</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.cartList} style={styles.cartListScroll}>
            {cart.map((item) => (
              <View key={item.idplatillo} style={styles.cartItem}>
                <View style={styles.cartMain}>
                  <Text style={styles.cartItemName}>{item.nombre}</Text>
                  <Text style={styles.cartItemMeta}>Q{item.precio.toFixed(0)} c/u</Text>
                </View>
                <View style={styles.qtyRow}>
                  <Pressable onPress={() => removeFromCart(item.idplatillo)} style={styles.qtyBtn}>
                    <Text style={styles.deleteText}>🗑</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{item.cantidad}</Text>
                  <Pressable
                    onPress={() =>
                      addToCart({
                        idplatillo: item.idplatillo,
                        nombre: item.nombre,
                        precio: item.precio,
                      })
                    }
                    style={styles.qtyBtn}
                  >
                    <Text style={styles.plusText}>+</Text>
                  </Pressable>
                  <Text style={styles.itemPrice}>Q{(item.precio * item.cantidad).toFixed(0)}</Text>
                </View>
              </View>
            ))}

            {cart.length === 0 ? <Text style={styles.emptyCart}>Aún no has agregado productos</Text> : null}
          </ScrollView>

          <View style={styles.cartFooter}>
            <Text style={styles.totalText}>Total: Q{total.toFixed(2)}</Text>
            {confirmMessage ? <Text style={styles.confirmMessage}>{confirmMessage}</Text> : null}
            <View style={styles.cartActions}>
              <Pressable
                style={[styles.emptyButton, cart.length === 0 && styles.emptyButtonDisabled]}
                disabled={cart.length === 0}
                onPress={clearCart}
              >
                <Text style={styles.emptyButtonText}>Vaciar</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmButton, (cart.length === 0 || confirming) && styles.confirmButtonDisabled]}
                disabled={cart.length === 0 || confirming}
                onPress={confirmarPedido}
              >
                <Text style={styles.confirmButtonText}>{confirming ? "Confirmando..." : "🧾  Confirmar Pedido"}</Text>
              </Pressable>
            </View>
            <Pressable style={styles.historyButton} onPress={() => router.push("/(cliente)/seguimiento")}>
              <Text style={styles.historyButtonText}>Ver historial</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {isPhone && !cartVisible ? (
        <View style={styles.mobileCartBarWrap}>
          <Pressable style={styles.mobileCartBar} onPress={() => setCartVisible(true)}>
            <Text style={styles.mobileCartBarText}>
              Ir al carrito (Q{total.toFixed(2)} por {cart.reduce((acc, item) => acc + item.cantidad, 0)} artículo(s))
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  topBar: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#dbe1e8",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  brand: { fontSize: 30, fontWeight: "800", color: "#0f172a" },
  subBrand: { fontSize: 16, color: "#64748b" },
  badgeRow: { flexDirection: "row", gap: 10 },
  progressWrap: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 2 },
  progressTitle: { color: "#334155", fontWeight: "800", fontSize: 14, marginBottom: 8 },
  progressList: { gap: 8, paddingRight: 14 },
  progressEmpty: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  progressEmptyText: { color: "#64748b", fontWeight: "600" },
  progressCard: {
    minWidth: 190,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  progressCode: { color: "#0f172a", fontWeight: "800", fontSize: 14 },
  progressStatus: { marginTop: 4, fontWeight: "700", fontSize: 13 },
  progressUser: { marginTop: 4, color: "#334155", fontWeight: "600", fontSize: 12 },
  progressPending: { borderColor: "#fdba74", backgroundColor: "#fff7ed" },
  progressPaid: { borderColor: "#93c5fd", backgroundColor: "#eff6ff" },
  progressPreparing: { borderColor: "#c4b5fd", backgroundColor: "#f5f3ff" },
  progressReady: { borderColor: "#86efac", backgroundColor: "#f0fdf4" },
  progressPendingText: { color: "#c2410c" },
  progressPaidText: { color: "#1d4ed8" },
  progressPreparingText: { color: "#6d28d9" },
  progressReadyText: { color: "#15803d" },
  userBadge: {
    backgroundColor: "#dbeafe",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  userName: { color: "#1e3a8a", fontWeight: "700" },
  cartBadge: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  cartBadgeActive: { backgroundColor: "#1e3a8a", borderColor: "#1e3a8a" },
  cartText: { color: "#1f2937", fontWeight: "700" },
  cartTextActive: { color: "#fff" },
  logoutBadge: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#fecaca", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  logoutText: { color: "#dc2626", fontWeight: "700" },
  categoryRow: {
    marginTop: 12,
    marginHorizontal: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dbe1e8",
    borderRadius: 12,
    padding: 8,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  category: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  categoryPhone: { width: "48%", alignItems: "center" },
  categoryText: { color: "#334155", fontWeight: "700" },
  categoryActive: { backgroundColor: "#1e63e9" },
  categoryTextActive: { color: "#fff" },
  phoneFilterWrap: {
    marginTop: 12,
    marginHorizontal: 20,
    gap: 8,
  },
  phoneFilterTrigger: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dbe1e8",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  phoneFilterLabel: { color: "#334155", fontWeight: "700" },
  phoneFilterArrow: { color: "#334155", fontWeight: "800" },
  phoneFilterMenu: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dbe1e8",
    borderRadius: 12,
    padding: 6,
    gap: 6,
  },
  phoneFilterOption: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  phoneFilterOptionActive: { backgroundColor: "#1e63e9" },
  phoneFilterOptionText: { color: "#334155", fontWeight: "700" },
  phoneFilterOptionTextActive: { color: "#fff" },
  search: {
    marginTop: 12,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
  },
  grid: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    width: "24%",
    minWidth: 260,
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#dbe1e8",
  },
  cardPhone: { width: "48%", minWidth: 0 },
  photo: { height: 170, backgroundColor: "#d1d5db", alignItems: "center", justifyContent: "center" },
  photoPhone: { height: 110 },
  photoText: { color: "#475569", fontWeight: "700" },
  cardBody: { padding: 12 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  name: { fontSize: 20, fontWeight: "800", color: "#0f172a", flex: 1, marginRight: 8 },
  namePhone: { fontSize: 16 },
  price: { fontSize: 20, fontWeight: "800", color: "#1e63e9" },
  pricePhone: { fontSize: 16 },
  desc: { color: "#64748b", fontSize: 15, minHeight: 44 },
  addButton: { marginTop: 10, backgroundColor: "#1e63e9", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  addButtonPhone: { marginTop: 8, paddingVertical: 8 },
  addText: { color: "#fff", fontWeight: "800", fontSize: 17 },
  addTextPhone: { fontSize: 15 },
  fixedCart: {
    position: "absolute",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dbe1e8",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fixedCartDesktop: {
    right: 16,
    bottom: 14,
  },
  fixedCartPhone: {
    left: 10,
    right: 10,
    bottom: 10,
  },
  cartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  cartTitle: { fontSize: 30, fontWeight: "800", color: "#0f172a" },
  cartHeaderRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  cartCount: { color: "#64748b", fontWeight: "700" },
  closeCartText: { color: "#334155", fontWeight: "900", fontSize: 18 },
  cartListScroll: { flex: 1 },
  cartList: { gap: 12, paddingBottom: 12 },
  cartItem: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  cartMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cartItemName: { fontWeight: "700", color: "#0f172a", fontSize: 16 },
  cartItemMeta: { color: "#64748b", fontSize: 13, marginTop: 2 },
  qtyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  deleteText: { color: "#dc2626", fontSize: 14 },
  plusText: { color: "#0f172a", fontSize: 18, fontWeight: "800", marginTop: -2 },
  qtyValue: { color: "#0f172a", fontWeight: "800", minWidth: 16, textAlign: "center" },
  itemPrice: { marginLeft: "auto", color: "#1e40af", fontWeight: "800", fontSize: 18 },
  emptyCart: { textAlign: "center", color: "#64748b", marginTop: 12 },
  cartFooter: { borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 14, gap: 10 },
  totalText: { fontSize: 34, fontWeight: "800", color: "#0f172a", textAlign: "right" },
  confirmMessage: { color: "#1d4ed8", fontWeight: "600" },
  cartActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  emptyButton: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyButtonDisabled: { opacity: 0.5 },
  emptyButtonText: { color: "#334155", fontWeight: "700" },
  confirmButton: { backgroundColor: "#dc2626", borderRadius: 12, paddingVertical: 12, alignItems: "center", flex: 1 },
  confirmButtonDisabled: { backgroundColor: "#94a3b8" },
  confirmButtonText: { color: "#fff", fontWeight: "800", fontSize: 24 },
  historyButton: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  historyButtonText: { color: "#1f2937", fontWeight: "700" },
  mobileCartBarWrap: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
  },
  mobileCartBar: {
    backgroundColor: "#facc15",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  mobileCartBarText: { color: "#111827", fontWeight: "800", fontSize: 16 },
  info: { marginTop: 10, textAlign: "center", color: "#64748b" },
  error: { marginTop: 10, textAlign: "center", color: "#dc2626" },
});
