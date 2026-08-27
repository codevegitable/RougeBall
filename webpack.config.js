const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

// 生产环境：把 JS / CSS 内联进 index.html，最终只输出一个 HTML 文件。
// 游戏没有本地图片/音频/字体资源，全部由 Canvas + Web Audio 生成，
// 唯一的外部依赖是 Google Fonts 的 Silkscreen 字体（离线时回退到系统字体，
// 该 <link> 是外部 URL，不会被内联）。
class InlineSingleFilePlugin {
    apply(compiler) {
        compiler.hooks.compilation.tap("InlineSingleFilePlugin", (compilation) => {
            HtmlWebpackPlugin.getHooks(compilation).beforeEmit.tapAsync(
                "InlineSingleFilePlugin",
                (data, cb) => {
                    let html = data.html;

                    // 内联 JS：<script ... src="..."></script> -> <script>内容</script>
                    html = html.replace(
                        /<script[^>]*\s+src="([^"]+)"[^>]*><\/script>/g,
                        (tag, src) => {
                            const asset = compilation.getAsset(src);
                            if (!asset) return tag; // 外部 URL 等非本地资源保持原样
                            // 转义 </script>，避免字符串提前闭合内联脚本
                            const source = asset.source
                                .source()
                                .replace(/<\/script/gi, "<\\/script");
                            return `<script>${source}</script>`;
                        }
                    );

                    // 内联 CSS：<link href="..." rel="stylesheet"> -> <style>内容</style>
                    // （当前生产用 style-loader，不会产出独立 CSS 文件，作为兜底）
                    html = html.replace(
                        /<link href="([^"]+)" rel="stylesheet">/g,
                        (tag, href) => {
                            const asset = compilation.getAsset(href);
                            if (!asset) return tag; // Google Fonts 等外部链接保持原样
                            return `<style>${asset.source.source()}</style>`;
                        }
                    );

                    data.html = html;
                    cb(null, data);
                }
            );

            // 内联完成后删除独立的 js / css / source map 产物，dist 里只保留 index.html
            compilation.hooks.afterProcessAssets.tap("InlineSingleFilePlugin", () => {
                for (const name of Object.keys(compilation.assets)) {
                    if (/\.(js|css)(\.map)?$/.test(name)) {
                        compilation.deleteAsset(name);
                    }
                }
            });
        });
    }
}

module.exports = (env, argv) => {
    const isProd = argv.mode === "production";

    return {
        entry: "./src/js/index.js",
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: "js/app.[contenthash:8].js",
            clean: true,
        },
        // 生产环境关闭 source map：.map 是独立文件，且会给 JS 追加 sourceMappingURL 注释，
        // 会破坏「单文件」目标。开发环境保留 eval-source-map。
        devtool: isProd ? false : "eval-source-map",
        module: {
            rules: [
                {
                    test: /\.css$/i,
                    // 生产也改用 style-loader：CSS 打进 JS bundle 里，随 JS 一起内联，
                    // 不再产出独立的 .css 文件。
                    use: ["style-loader", "css-loader"],
                },
                {
                    // 字体资源直接内联为 base64 data URI，随 CSS 一起打进单文件，
                    // 不产出独立字体文件。
                    test: /\.(woff2?|ttf|otf|eot)$/i,
                    type: "asset/inline",
                },
            ],
        },
        plugins: [
            new HtmlWebpackPlugin({
                template: "src/index.html",
                inject: "body",
            }),
            ...(isProd ? [new InlineSingleFilePlugin()] : []),
        ],
        devServer: {
            port: 8080,
            open: true,
        },
    };
};
