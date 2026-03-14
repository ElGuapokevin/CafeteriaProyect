// app/index.tsx
import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { login } from "@/lib/api/client";
import { useAppStore } from "@/lib/store/app-store";

export default function HomeScreen() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setUser = useAppStore((state) => state.setUser);

  const canContinue = useMemo(() => value.trim().length > 0, [value]);

  async function handleLogin() {
    if (!canContinue || loading) return;
    setError(null);
    setLoading(true);
    try {
      const user = await login({ identificador: value.trim() });
      setUser(user);

      if (user.rol === "cliente") {
        router.push("/(cliente)/menu");
      } else if (user.rol === "cocina" || user.rol === "cajero") {
        router.push("/(cocina)");
      } else {
        router.push("/(admin)");
      }
    } catch (apiError) {
      const message = apiError instanceof Error ? apiError.message : "No se pudo iniciar sesión";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>🍴</Text>
          </View>
          <Text style={styles.headerTitle}>UniFood</Text>
          <Text style={styles.headerSubtitle}>Cafetería Universitaria</Text>
        </View>

        <View style={styles.cardContainer}>
          <View style={styles.card}>
            <Text style={styles.title}>Iniciar sesión</Text>
            <Text style={styles.subtitle}>
              Ingresa tu correo o número de carné
            </Text>

            <Text style={styles.label}>Correo o carné</Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder="correo@dominio.com o A2026001"
              autoCapitalize="none"
              keyboardType="default"
              style={styles.input}
              placeholderTextColor="#6b7280"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              disabled={!canContinue || loading}
              onPress={handleLogin}
              style={[styles.cta, (!canContinue || loading) && styles.ctaDisabled]}
            >
              <Text style={styles.ctaText}>{loading ? "Ingresando..." : "Entrar →"}</Text>
            </Pressable>

            <Text style={styles.helper}>Te redirigiremos automáticamente según tu rol</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
  header: {
    backgroundColor: "#1e63e9",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingTop: 56,
    paddingBottom: 36,
    alignItems: "center",
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    marginBottom: 10,
  },
  logoText: { fontSize: 30 },
  headerTitle: { color: "#fff", fontSize: 44, fontWeight: "800" },
  headerSubtitle: { color: "#dbeafe", fontSize: 18, marginTop: 6 },
  cardContainer: { marginTop: -18, paddingHorizontal: 24 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 18,
    gap: 10,
  },
  title: { textAlign: "center", marginTop: 8, fontSize: 36, fontWeight: "800", color: "#0f172a" },
  subtitle: { textAlign: "center", color: "#64748b", fontSize: 17, marginTop: 2 },
  label: { marginTop: 14, color: "#0f172a", fontWeight: "700", fontSize: 18 },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 20,
    color: "#111827",
  },
  cta: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: "#1e63e9",
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaDisabled: { backgroundColor: "#9ca3af" },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 30 },
  helper: { marginTop: 14, textAlign: "center", color: "#64748b", fontSize: 15 },
  error: { marginTop: 8, color: "#dc2626", fontSize: 14, textAlign: "center" },
});