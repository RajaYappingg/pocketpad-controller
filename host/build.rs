fn main() {
    println!("cargo:rerun-if-changed=../web/dist");
    println!("cargo:rerun-if-changed=../web/dist/index.html");

    if !std::path::Path::new("../web/dist/index.html").exists() {
        panic!(
            "web/dist/index.html not found — the frontend must be built first: \
            run `pnpm --dir web install && pnpm --dir web build` (or `.\\scripts\\build.ps1`)"
        );
    }
}
