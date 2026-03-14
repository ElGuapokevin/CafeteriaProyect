import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppStore } from "@/lib/store/app-store";

export default function AdminScreen() {
  const user = useAppStore((state) => state.user);
  const logout = useAppStore((state) => state.logout);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Panel Admin</Text>
      <Text style={styles.subtitle}>Bienvenido, {user?.nombre ?? "Administrador"}</Text>
      <Text style={styles.text}>Desde aquí puedes administrar catálogos y usuarios.</Text>

      <Pressable
        style={styles.button}
        onPress={() => {
          logout();
          router.replace("/");
        }}
      >
        <Text style={styles.buttonText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f1f5f9", padding: 20 },
  title: { fontSize: 34, fontWeight: "800", color: "#0f172a" },
  subtitle: { marginTop: 8, fontSize: 18, color: "#334155" },
  text: { marginTop: 12, textAlign: "center", color: "#64748b" },
  button: { marginTop: 20, backgroundColor: "#1e63e9", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  buttonText: { color: "#fff", fontWeight: "800" },
});
