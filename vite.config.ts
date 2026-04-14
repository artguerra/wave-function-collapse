import path from "path";

export default {
  resolve: {
    base: "wave-function-collapse",
    alias: {
      "@": path.resolve(__dirname, "./src/"),
      "@assets": path.resolve(__dirname, "./assets/"),
    }
  },
};
