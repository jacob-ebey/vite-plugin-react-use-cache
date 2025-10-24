import * as crypto from "node:crypto";
import * as path from "node:path";

import * as babelCore from "@babel/core";
import { addNamed as addNamedImport } from "@babel/helper-module-imports";
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
  const cacheIdMap: Record<string, number> = {};

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
      if (mode === "dev") {
        cacheIdMap[id] ??= Date.now();
        cacheIdMap[id]++;
      }

      const filepath = id.split("?")[0];
      const isJSX = filepath.endsWith("x");

      let cacheImported: babelCore.types.Identifier | null = null;
      let getFileHashImported: babelCore.types.Identifier | null = null;
      let programPath!: babelCore.NodePath<babelCore.types.Program>;
      const babelConfig = {
        filename: id,
        sourceFileName: filepath,
        retainLines: !this.environment.config.isProduction && isJSX,
        sourceType: "module",
        sourceMaps: true,
        plugins: [
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
                  const { cacheFunctionParams, callArgs } =
                    getParameterInfo(functionScope);
                  const cacheFunctionArgs = [
                    ...Array.from(nonLocalVariables).map((name) =>
                      babelCore.types.identifier(name)
                    ),
                    ...cacheFunctionParams,
                  ];
                  const cacheCallArgs = [
                    ...Array.from(nonLocalVariables).map((name) =>
                      babelCore.types.identifier(name)
                    ),
                    ...callArgs,
                  ];
                  const cacheIds = getCacheId(
                    relativeFilename,
                    mode,
                    functionScope
                  );
                  if (mode === "dev") {
                    cacheIds.push(String(cacheIdMap[id]));
                  }

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
                            cacheFunctionArgs,
                            babelCore.types.cloneNode(functionScope.node.body),
                            true
                          ),
                          babelCore.types.arrayExpression([
                            babelCore.types.callExpression(
                              getFileHashImported,
                              []
                            ),
                            ...cacheIds.map((v) =>
                              babelCore.types.stringLiteral(v)
                            ),
                          ]),
                        ]),
                        cacheCallArgs
                      )
                    ),
                  ]);

                  functionScope.replaceWith(clone);
                },
              },
            };
          },
        ],
      } satisfies babelCore.TransformOptions;

      const res = await babelCore.transformAsync(code, babelConfig);
      if (typeof res?.code !== "string") return;
      return {
        // ensure new line to workaround
        // https://github.com/vitejs/vite-plugin-react/pull/923
        code: res.code + "\n",
        map: res.map,
      };
    },
    hotUpdate(ctx) {
      if (this.environment.name === rscEnv) {
        // invalidate "use cache" module when any depending module changes.
        // this will allow "use cache" transform to run again with a different cache id.
        const importers = collectImporters(ctx.modules);
        for (const node of importers) {
          if (node.id && node.id in cacheIdMap) {
            this.environment.moduleGraph.invalidateModule(node);
          }
        }
      }
    },
  };
}

function collectImporters(
  roots: vite.EnvironmentModuleNode[]
): Set<vite.EnvironmentModuleNode> {
  const visited = new Set<vite.EnvironmentModuleNode>();
  function recurse(node: vite.EnvironmentModuleNode) {
    if (visited.has(node)) {
      return;
    }
    visited.add(node);
    for (const importer of node.importers) {
      recurse(importer);
    }
  }
  for (const root of roots) {
    recurse(root);
  }
  return visited;
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

function patternToExpression(
  pattern: babelCore.types.ObjectPattern | babelCore.types.ArrayPattern
): babelCore.types.Expression {
  if (babelCore.types.isObjectPattern(pattern)) {
    const properties: babelCore.types.ObjectProperty[] = [];

    for (const prop of pattern.properties) {
      if (babelCore.types.isObjectProperty(prop)) {
        const key = babelCore.types.cloneNode(prop.key);
        let value: babelCore.types.Expression;

        if (babelCore.types.isIdentifier(prop.value)) {
          value = babelCore.types.identifier(prop.value.name);
        } else if (
          babelCore.types.isObjectPattern(prop.value) ||
          babelCore.types.isArrayPattern(prop.value)
        ) {
          value = patternToExpression(prop.value);
        } else {
          // For other patterns, just use the identifier
          value = babelCore.types.identifier("unknown");
        }

        properties.push(
          babelCore.types.objectProperty(
            key,
            value,
            prop.computed,
            prop.shorthand
          )
        );
      }
    }

    return babelCore.types.objectExpression(properties);
  } else if (babelCore.types.isArrayPattern(pattern)) {
    const elements: (
      | babelCore.types.Expression
      | babelCore.types.SpreadElement
    )[] = [];

    for (const elem of pattern.elements) {
      if (babelCore.types.isIdentifier(elem)) {
        elements.push(babelCore.types.identifier(elem.name));
      } else if (
        elem &&
        (babelCore.types.isObjectPattern(elem) ||
          babelCore.types.isArrayPattern(elem))
      ) {
        elements.push(patternToExpression(elem));
      } else if (babelCore.types.isRestElement(elem)) {
        if (babelCore.types.isIdentifier(elem.argument)) {
          elements.push(
            babelCore.types.spreadElement(
              babelCore.types.identifier(elem.argument.name)
            )
          );
        }
      }
    }

    return babelCore.types.arrayExpression(elements);
  }

  throw new Error(`Unsupported pattern type: ${(pattern as any).type}`);
}

function getParameterInfo(
  path: babelCore.NodePath<
    | babelCore.types.FunctionDeclaration
    | babelCore.types.FunctionExpression
    | babelCore.types.ArrowFunctionExpression
  >
) {
  const paramNodes = path.node.params;
  const cacheFunctionParams: (
    | babelCore.types.Identifier
    | babelCore.types.Pattern
    | babelCore.types.RestElement
  )[] = [];
  const callArgs: babelCore.types.Expression[] = [];

  for (const param of paramNodes) {
    if (babelCore.types.isIdentifier(param)) {
      // Simple identifier parameter - pass as-is
      if (path.isReferenced(param)) {
        cacheFunctionParams.push(babelCore.types.cloneNode(param));
        callArgs.push(babelCore.types.identifier(param.name));
      }
    } else if (babelCore.types.isObjectPattern(param)) {
      // Destructured object - keep the pattern and reconstruct for call
      const usedIdentifiers: babelCore.types.Identifier[] = [];

      for (const prop of param.properties) {
        if (babelCore.types.isObjectProperty(prop)) {
          if (babelCore.types.isIdentifier(prop.key)) {
            const identifier = babelCore.types.isIdentifier(prop.value)
              ? prop.value
              : prop.key;
            usedIdentifiers.push(identifier);
          }
        } else if (babelCore.types.isRestElement(prop)) {
          if (babelCore.types.isIdentifier(prop.argument)) {
            usedIdentifiers.push(prop.argument);
          }
        }
      }

      // Check if any of the destructured identifiers are referenced
      const referencedIdentifiers = usedIdentifiers.filter((id) =>
        path.isReferenced(id)
      );

      if (referencedIdentifiers.length > 0) {
        // Keep the original destructured pattern for the cached function
        cacheFunctionParams.push(babelCore.types.cloneNode(param));

        // Reconstruct the pattern as an object expression for the call
        callArgs.push(patternToExpression(param));
      }
    } else if (babelCore.types.isArrayPattern(param)) {
      // Destructured array - keep the pattern and reconstruct for call
      const usedIdentifiers: babelCore.types.Identifier[] = [];

      for (const elem of param.elements) {
        if (babelCore.types.isIdentifier(elem)) {
          usedIdentifiers.push(elem);
        } else if (
          babelCore.types.isRestElement(elem) &&
          babelCore.types.isIdentifier(elem.argument)
        ) {
          usedIdentifiers.push(elem.argument);
        }
      }

      const referencedIdentifiers = usedIdentifiers.filter((id) =>
        path.isReferenced(id)
      );

      if (referencedIdentifiers.length > 0) {
        // Keep the original destructured pattern for the cached function
        cacheFunctionParams.push(babelCore.types.cloneNode(param));

        // Reconstruct the pattern as an array expression for the call
        callArgs.push(patternToExpression(param));
      }
    } else if (
      babelCore.types.isRestElement(param) &&
      babelCore.types.isIdentifier(param.argument)
    ) {
      // Rest parameter
      if (path.isReferenced(param.argument)) {
        cacheFunctionParams.push(babelCore.types.cloneNode(param));
        callArgs.push(babelCore.types.identifier(param.argument.name));
      }
    } else {
      throw new Error(
        `Unsupported parameter type: ${param.type} in function ${
          (path.node as any).id?.name || "anonymous"
        }`
      );
    }
  }

  return { cacheFunctionParams, callArgs };
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
