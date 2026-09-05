import React from "react";
import {
  View,
  Text as RNText,
  TouchableOpacity,
  TextInput,
  StyleSheet
} from "react-native";
import { useBrand } from "./theme.native";
import { deriveTokens } from "./theme-utils";

export const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const brand = useBrand();
  const derived = deriveTokens(brand.tokens);
  return (
    <View style={[styles.page, { backgroundColor: brand.tokens.background }]}>
      <View
        pointerEvents="none"
        style={[
          styles.pageGlow,
          { backgroundColor: derived.accentSoft }
        ]}
      />
      {children}
    </View>
  );
};

export const Section: React.FC<{ title?: string; children: React.ReactNode }> = ({
  title,
  children
}) => {
  const brand = useBrand();
  const derived = deriveTokens(brand.tokens);
  return (
    <View
      style={[
        styles.section,
        derived.isDark ? styles.shadowDark : styles.shadowLight,
        {
          borderColor: derived.borderSoft,
          backgroundColor: derived.surface
        }
      ]}
    >
      {title ? (
        <RNText style={[styles.sectionTitle, { color: brand.tokens.muted }]}> {title} </RNText>
      ) : null}
      {children}
    </View>
  );
};

export const Heading: React.FC<{ children: React.ReactNode; level?: 1 | 2 | 3 }> = ({
  children,
  level = 1
}) => {
  const brand = useBrand();
  const size = level === 1 ? 30 : level === 2 ? 22 : 16;
  return (
    <RNText
      style={[
        styles.heading,
        { fontSize: size, color: brand.tokens.text }
      ]}
    >
      {children}
    </RNText>
  );
};

export const Text: React.FC<{ children: React.ReactNode; muted?: boolean; key?: React.Key }> = ({
  children,
  muted
}) => {
  const brand = useBrand();
  return (
    <RNText style={[styles.text, { color: muted ? brand.tokens.muted : brand.tokens.text }]}>
      {children}
    </RNText>
  );
};

export const Button: React.FC<{
  children: React.ReactNode;
  onPress?: () => void;
  variant?: "primary" | "ghost";
  disabled?: boolean;
}> = ({ children, onPress, variant = "primary", disabled }) => {
  const brand = useBrand();
  const derived = deriveTokens(brand.tokens);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        variant === "ghost"
          ? {
              backgroundColor: "transparent",
              borderColor: derived.borderSoft,
              borderWidth: 1
            }
          : { backgroundColor: brand.tokens.accent },
        disabled ? { opacity: 0.6 } : null
      ]}
    >
      <RNText style={{ color: variant === "ghost" ? brand.tokens.text : "#fff", letterSpacing: 1 }}>
        {children}
      </RNText>
    </TouchableOpacity>
  );
};

export const Input: React.FC<React.ComponentProps<typeof TextInput>> = (props) => {
  const brand = useBrand();
  const derived = deriveTokens(brand.tokens);
  return (
    <TextInput
      {...props}
      style={[
        styles.input,
        {
          borderColor: derived.borderSoft,
          color: brand.tokens.text,
          backgroundColor: derived.surfaceStrong
        },
        props.style
      ]}
      placeholderTextColor={brand.tokens.muted}
    />
  );
};

export const Card: React.FC<{ children: React.ReactNode; key?: React.Key }> = ({ children }) => {
  const brand = useBrand();
  const derived = deriveTokens(brand.tokens);
  return (
    <View
      style={[
        styles.card,
        derived.isDark ? styles.shadowDark : styles.shadowLight,
        { borderColor: derived.borderSoft, backgroundColor: derived.surfaceStrong }
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    position: "relative",
    padding: 26,
    gap: 22
  },
  pageGlow: {
    position: "absolute",
    right: -120,
    top: -140,
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.35
  },
  section: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 18,
    gap: 12
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase"
  },
  heading: {
    fontWeight: "600"
  },
  text: {
    fontSize: 14,
    lineHeight: 21
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center"
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12
  },
  card: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 14
  },
  shadowLight: {
    shadowColor: "#0f1219",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  shadowDark: {
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4
  }
});
