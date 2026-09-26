import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { colors } from "../theme";

type EqualizerProps = {
  active: boolean;
};

const BAR_COUNT = 5;

export function Equalizer({ active }: EqualizerProps) {
  const barsRef = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.18)),
  );

  useEffect(() => {
    const bars = barsRef.current;
    const loops = bars.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 110),
          Animated.timing(value, {
            toValue: 0.9 - index * 0.08,
            duration: 340 + index * 45,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.24 + index * 0.03,
            duration: 320 + index * 55,
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    if (active) {
      loops.forEach((loop) => loop.start());
      return () => {
        loops.forEach((loop) => loop.stop());
      };
    }

    bars.forEach((value) => {
      value.stopAnimation();
      Animated.timing(value, {
        toValue: 0.18,
        duration: 180,
        useNativeDriver: true,
      }).start();
    });

    return undefined;
  }, [active]);

  return (
    <View style={styles.row}>
      {barsRef.current.map((value, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            {
              transform: [{ scaleY: value }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
    height: 28,
  },
  bar: {
    width: 5,
    height: 26,
    borderRadius: 999,
    backgroundColor: colors.accent2,
  },
});
