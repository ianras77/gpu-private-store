import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients } from "../theme";

type GlassCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function GlassCard({ children, style, contentStyle }: GlassCardProps) {
  return (
    <View style={[styles.shell, style]}>
      <LinearGradient
        colors={gradients.panel}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.edgeGlow} pointerEvents="none" />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    shadowColor: colors.shadow,
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: {
      width: 0,
      height: 18,
    },
    elevation: 16,
  },
  edgeGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  content: {
    padding: 20,
  },
});
