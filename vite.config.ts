import path from "path";

export default {
  base: "wave-function-collapse",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/"),
      "@assets": path.resolve(__dirname, "./assets/"),
    }
  },
};
