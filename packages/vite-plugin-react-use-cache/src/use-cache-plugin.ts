import * as crypto from "node:crypto";
import * as path from "node:path";

import * as babelCore from "@babel/core";
import { addNamed as addNamedImport } from "@babel/helper-module-imports";
// @ts-expect-error These modules don't have types
import babelPluginSyntaxJSX from "@babel/plugin-syntax-jsx";
// @ts-expect-error These modules don't have types
import babelPresetTypeScript from "@babel/preset-typescript";
import * as vite from "vite";

export function useCachePlugin({
  cacheExportName = "cache",
  cacheImportPath = "vite-plugin-react-use-cache/runtime",
  environment: {
    browser: browserEnv = "client",
    ssr: ssrEnv = "ssr",
    rsc: rscEnv = "rsc",
  } = {},
}: {
  cacheExportName?: string;
  cacheImportPath?: string;
  environment?: {
    browser?: string;
    ssr?: string;
    rsc?: string;
  };
} = {}): vite.Plugin {
  return {
    name: "react-use-cache",
    configEnvironment(name) {
      if (name === rscEnv) {
        return {
          resolve: {
            noExternal: [cacheImportPath],
          },
        };
      }
    },
    resolveId(source) {
      if (source === "@vitejs/plugin-rsc/client") {
        if (this.environment.name === browserEnv) {
          return this.resolve("@vitejs/plugin-rsc/browser");
        }
        if (this.environment.name === ssrEnv) {
          return this.resolve("@vitejs/plugin-rsc/ssr");
        }
      }
    },
    async transform(code, id) {
      if (this.environment.name !== rscEnv) {
        return;
      }

      const match = code.match(/(['"])use cache(['"])/);
      if (!match || !(match[1] === match[2])) {
        return;
      }

      const mode = this.environment.mode;
      const relativeFilename = vite.normalizePath(
        path.relative(this.environment.config.root, id)
      );

      let cacheImported: babelCore.types.Identifier | null = null;
      let getFileHashImported: babelCore.types.Identifier | null = null;
      let programPath!: babelCore.NodePath<babelCore.types.Program>;
      const babelConfig = {
        filename: id,
        presets: [[babelPresetTypeScript, { jsx: "preserve" }]],
        plugins: [
          babelPluginSyntaxJSX,
          () => {
            return {
              visitor: {
                Program(path: babelCore.NodePath<babelCore.types.Program>) {
                  programPath = path;
                },
                Directive(path: babelCore.NodePath<babelCore.types.Directive>) {
                  const directive = path.node.value.value;
                  if (directive !== "use cache") {
                    return;
                  }
                  path.remove();

                  if (!cacheImported || !getFileHashImported) {
                    cacheImported = addNamedImport(
                      programPath,
                      cacheExportName,
                      cacheImportPath
                    );
                    getFileHashImported = addNamedImport(
                      programPath,
                      "getFileHash",
                      cacheImportPath
                    );
                  }

                  const functionScope = path.findParent(
                    (path) =>
                      path.isFunctionDeclaration() ||
                      path.isFunctionExpression() ||
                      path.isArrowFunctionExpression()
                  ) as babelCore.NodePath<
                    | babelCore.types.FunctionDeclaration
                    | babelCore.types.FunctionExpression
                    | babelCore.types.ArrowFunctionExpression
                  > | null;
                  if (!functionScope) return;

                  const nonLocalVariables = getNonLocalVariables(functionScope);
                  const usedArgs = getUsedFunctionArguments(functionScope);

                  const clone = babelCore.types.cloneNode(
                    functionScope.node,
                    false,
                    true
                  );
                  clone.body = babelCore.types.blockStatement([
                    babelCore.types.returnStatement(
                      babelCore.types.callExpression(
                        babelCore.types.callExpression(cacheImported, [
                          babelCore.types.arrowFunctionExpression(
                            [],
                            babelCore.types.cloneNode(functionScope.node.body),
                            true
                          ),
                          babelCore.types.arrayExpression([
                            babelCore.types.callExpression(
                              getFileHashImported,
                              []
                            ),
                            ...getCacheId(
                              relativeFilename,
                              mode,
                              functionScope
                            ).map((v) => babelCore.types.stringLiteral(v)),
                            ...Array.from(nonLocalVariables).map((name) =>
                              babelCore.types.identifier(name)
                            ),
                            ...usedArgs,
                          ]),
                        ]),
                        []
                      )
                    ),
                  ]);

                  functionScope.replaceWith(clone);
                },
              },
            };
          },
        ],
      };

      const res = await babelCore.transformAsync(code, babelConfig);
      if (typeof res?.code !== "string") return;
      return {
        code: res.code,
        map: res.map,
      };
    },
  };
}

function getCacheId(
  filename: string,
  mode: "build" | "dev" | "unknown",
  path: babelCore.NodePath<
    | babelCore.types.FunctionDeclaration
    | babelCore.types.FunctionExpression
    | babelCore.types.ArrowFunctionExpression
  >
): string[] {
  const location = path.node.loc;
  if (!location) {
    throw new Error("Function does not have a location");
  }
  const cacheIdParts = [
    `${filename}:${location.start.line}:${location.start.column}`,
    crypto.createHash("sha256").update(path.toString()).digest("hex"),
  ];

  return cacheIdParts;
}

function getUsedFunctionArguments(
  path: babelCore.NodePath<
    | babelCore.types.FunctionDeclaration
    | babelCore.types.FunctionExpression
    | babelCore.types.ArrowFunctionExpression
  >
) {
  const paramNodes = path.node.params;
  const identifiers: babelCore.types.Identifier[] = [];

  for (const param of paramNodes) {
    if (babelCore.types.isIdentifier(param)) {
      identifiers.push(param);
    } else if (babelCore.types.isObjectPattern(param)) {
      for (const prop of param.properties) {
        if (babelCore.types.isObjectProperty(prop)) {
          if (babelCore.types.isIdentifier(prop.key)) {
            if (babelCore.types.isIdentifier(prop.value)) {
              identifiers.push(prop.value);
            } else {
              identifiers.push(prop.key);
            }
          }
        }
      }
    } else if (babelCore.types.isArrayPattern(param)) {
      for (const elem of param.elements) {
        if (babelCore.types.isIdentifier(elem)) {
          identifiers.push(elem);
        }
      }
    } else if (
      babelCore.types.isRestElement(param) &&
      babelCore.types.isIdentifier(param.argument)
    ) {
      identifiers.push(param.argument);
    } else {
      throw new Error(
        `Unsupported parameter type: ${param.type} in function ${
          (path.node as any).id?.name || "anonymous"
        }`
      );
    }
  }

  return identifiers.filter((id) => {
    return path.isReferenced(id);
  });
}

function getNonLocalVariables(
  path: babelCore.NodePath<
    | babelCore.types.FunctionDeclaration
    | babelCore.types.FunctionExpression
    | babelCore.types.ArrowFunctionExpression
  >
) {
  const nonLocalVariables = new Set<string>();
  const programScope = path.scope.getProgramParent();

  path.traverse({
    Identifier(identPath: babelCore.NodePath<babelCore.types.Identifier>) {
      const { name } = identPath.node;
      if (nonLocalVariables.has(name) || !identPath.isReferencedIdentifier()) {
        return;
      }

      const binding = identPath.scope.getBinding(name);
      if (!binding) {
        // probably a global, or an unbound variable. ignore it.
        return;
      }
      if (binding.scope === programScope) {
        // module-level declaration. no need to close over it.
        return;
      }

      if (
        // function args or a var at the top-level of its body
        binding.scope === path.scope ||
        // decls from blocks within the function
        isChildScope({
          parent: path.scope,
          child: binding.scope,
          root: programScope,
        })
      ) {
        // the binding came from within the function = it's not closed-over, so don't add it.
        return;
      }

      nonLocalVariables.add(name);
    },
  });

  return nonLocalVariables;
}

function isChildScope({
  root,
  parent,
  child,
}: {
  root: babelCore.NodePath["scope"];
  parent: babelCore.NodePath["scope"];
  child: babelCore.NodePath["scope"];
}) {
  let curScope = child;
  while (curScope !== root) {
    if (curScope.parent === parent) {
      return true;
    }
    curScope = curScope.parent;
  }
  return false;
}
