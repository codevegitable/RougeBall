// 视觉审计专用打包配置：只产出一个自包含 bundle + 承载页，不清理目录
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
    mode: "development",
    entry: path.resolve(__dirname, "audit.js"),
    output: {
        path: path.resolve(__dirname, "../.audit"),
        filename: "audit-bundle.js",
        clean: true,
    },
    devtool: false,
    module: {
        rules: [{ test: /\.css$/i, use: ["style-loader", "css-loader"] }],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: path.resolve(__dirname, "audit-template.html"),
            filename: "index.html",
        }),
    ],
};
