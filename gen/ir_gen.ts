import ts from "typescript";
// import fs from "fs";

export function gen_ir(clazzName: string, methods: string[], sourceFile: string) :IR {

    return generateIR(clazzName, methods, [sourceFile], {
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS
    });
}



/** Generate documentation for all classes in a set of .ts files */
function generateIR(
    clazzName: string, methods: string[],
    fileNames: string[],
    options: ts.CompilerOptions
): IR {
    let ir: IR|undefined = undefined;
    // Build a program using the set of root file names in fileNames
    let program = ts.createProgram(fileNames, options);

    // Get the checker, we will use it to find more about classes
    let checker = program.getTypeChecker();
    // let output: DocEntry[] = [];

    // Visit every sourceFile in the program
    for (const sourceFile of program.getSourceFiles()) {
        // if (!sourceFile.isDeclarationFile) {
            // Walk the tree to search for classes
            ts.forEachChild(sourceFile, visit);
        // }
    }

    // print out the doc
    // fs.writeFileSync("classes.json", JSON.stringify(output, undefined, 4));

    return ir!;
    
    /** visit nodes finding exported classes */
    function visit(node: ts.Node) {
        // Only consider exported nodes
        // if (!isNodeExported(node)) {
        //     return;
        // }

        if (ts.isClassDeclaration(node) && node.name && node.name?.escapedText == clazzName) {
            // This is a top level class, get its symbol
            let symbol = checker.getSymbolAtLocation(node.name);
            if (symbol) {
                let clazz = serializeClass(symbol);
                ir = {
                    name: clazz.name,
                    funcs: [],
                    proFuncs: [],
                }
            }
            // console.log("- " + node.name.getText());

            ts.forEachChild(node, visit);
            // No need to walk any further, class expressions/inner declarations
            // cannot be exported
        } else if (ts.isModuleDeclaration(node)) {
            // This is a namespace, visit its children
            ts.forEachChild(node, visit);
        } else if(ts.isMethodDeclaration(node)){
            let symbol = checker.getSymbolAtLocation(node.name);
            if (symbol) {
                let func = serializeFunction(symbol);
                // console.log("   - " + JSON.stringify(func));
                ir!.funcs.push(func);
            }
        } else if (ts.isPropertyDeclaration(node)) {
            let symbol = checker.getSymbolAtLocation(node.name);
            if (symbol) {
                let func = serializePropertyFunction(symbol);
                // console.log("   - " + JSON.stringify(func));
                ir!.proFuncs.push(func);
            }
        }
    }

    function serializePropertyFunction(symbol: ts.Symbol): Func {
        let details = serializeSymbol(symbol);
        let funcType = checker.getTypeOfSymbolAtLocation(
            symbol,
            symbol.valueDeclaration!
        );
        let funcSignature = funcType.getCallSignatures().map(serializeSignature);
        return {
            name: details.name,
            sign: funcSignature[0],
        }
    }

    function serializeFunction(symbol: ts.Symbol): Func {
        let details = serializeSymbol(symbol);
        let proFuncType = checker.getTypeOfSymbolAtLocation(
            symbol,
            symbol.valueDeclaration!
        );
        let funcSignature = proFuncType.getCallSignatures().map(serializeSignature);
        return {
            name: details.name,
            sign: funcSignature[0],
        }
    }
    /** Serialize a symbol into a json object */
    function serializeSymbol(symbol: ts.Symbol): Symbol {
        return {
            name: symbol.getName(),
            // documentation: ts.displayPartsToString(symbol.getDocumentationComment(checker)),
            type: checker.typeToString(
                checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)
            )
        };
    }

    /** Serialize a class symbol information */
    function serializeClass(symbol: ts.Symbol) {
        let details = serializeSymbol(symbol);
        return details;
    }

    /** Serialize a signature (call or construct) */
    function serializeSignature(signature: ts.Signature): FuncSign {
        return {
            args: signature.parameters.map(serializeSymbol),
            ret: checker.typeToString(signature.getReturnType()),
            // documentation: ts.displayPartsToString(signature.getDocumentationComment(checker))
        };
    }

    /** True if this is visible outside this file, false otherwise */
    // function isNodeExported(node: ts.Node): boolean {
    //     return (
    //         (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0 ||
    //         (!!node.parent && node.parent.kind === ts.SyntaxKind.SourceFile)
    //     );
    // }
}

interface Symbol {
    name: string;
    type: string;
}

interface FuncSign {
    args: Symbol[];
    ret: string;
    // ret: Symbol;
}
interface Func {
    name: string;
    sign: FuncSign;
}
export interface IR {
    name: string;
    funcs: Func[];
    proFuncs: Func[];
}