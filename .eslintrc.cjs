module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
    "prettier",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs"],
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  settings: { react: { version: "18.2" } },
  plugins: ["react-refresh"],
  rules: {
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
    "react/prop-types": 0,
    "react-refresh/only-export-components": "off",
  },
  overrides: [
    {
      files: ["src/components/EditorSidePanel/**/*.jsx"],
      rules: {
        "no-restricted-syntax": [
          "error",
          {
            selector:
              "JSXOpeningElement[name.name='Collapse'] > JSXAttribute[name.name='activeKey'] > JSXExpressionContainer > ConditionalExpression[alternate.value='']",
            message:
              'A conditional Collapse activeKey must fall back to [] (not ""): Semi UI ignores falsy activeKey values, so "" does not collapse the panel. See TablesTab.jsx.',
          },
        ],
      },
    },
  ],
};
