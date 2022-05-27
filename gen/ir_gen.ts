import ts from "typescript";
export function gen_ir(methods: string[], sourceFile: ts.SourceFile) :IR[]{
    console.log("gen ir for " + methods);
    return [];
}

export class IR {
    funcName: string | undefined;
    args: any[] | undefined;
}