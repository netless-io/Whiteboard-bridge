export type BaseTypeKey<T> = Pick<T, {
    [K in keyof T]: T[K] extends number | string | boolean | undefined ? K : never;
} [keyof T]>;

export type NumberType<T> = Pick<T, {
    [K in keyof T]: T[K] extends number | undefined ? K : never;
} [keyof T]>;

export type Require<T> = {
    [K in keyof T]-?: T[K]
};

export type Optional<T> = {
    [K in keyof T]?: T[K]
};

export type Writable<T> = {
    -readonly [P in keyof T]: T[P];
};