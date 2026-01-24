import path from "path";

export default {
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/"),
      "@assets": path.resolve(__dirname, "./assets/"),
    }
  },
};
