const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = (env, argv) => {
    const isProd = argv.mode === "production";

    return {
        entry: "./src/js/index.js",
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: isProd ? "js/app.[contenthash:8].js" : "js/app.js",
            clean: true,
        },
        devtool: isProd ? "source-map" : "eval-source-map",
        module: {
            rules: [
                {
                    test: /\.css$/i,
                    use: [
                        isProd ? MiniCssExtractPlugin.loader : "style-loader",
                        "css-loader",
                    ],
                },
            ],
        },
        plugins: [
            new HtmlWebpackPlugin({
                template: "src/index.html",
            }),
            ...(isProd
                ? [new MiniCssExtractPlugin({ filename: "css/style.[contenthash:8].css" })]
                : []),
        ],
        devServer: {
            port: 8080,
            open: true,
        },
    };
};