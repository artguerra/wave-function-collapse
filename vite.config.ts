import path from "path";
import rawPlugin from "vite-raw-plugin";

export default {
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/"),
      "@assets": path.resolve(__dirname, "./assets/"),
    }
  },
  plugins: [
    rawPlugin({
      fileRegex: /\.wgsl$/,
    })
  ],
};
