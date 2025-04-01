use std::{env, fs, process};

fn main() {
    let paths: Vec<String> = env::args().skip(1).collect();
    if paths.len() < 2 {
        eprintln!("usage: journey-wgsl-validator <shared.wgsl> <shader.wgsl>...");
        process::exit(2);
    }

    let shared = fs::read_to_string(&paths[0]).expect("read shared WGSL");
    let mut failed = false;

    for path in &paths[1..] {
        let shader = fs::read_to_string(path).expect("read shader WGSL");
        let source = format!("{shared}\n{shader}");
        match naga::front::wgsl::parse_str(&source) {
            Ok(module) => {
                let result = naga::valid::Validator::new(
                    naga::valid::ValidationFlags::all(),
                    naga::valid::Capabilities::all(),
                )
                .validate(&module);
                match result {
                    Ok(_) => println!("valid: {path}"),
                    Err(error) => {
                        failed = true;
                        eprintln!("validation failed: {path}: {error:?}");
                    }
                }
            }
            Err(error) => {
                failed = true;
                eprintln!("parse failed: {path}: {error:?}");
            }
        }
    }

    if failed {
        process::exit(1);
    }
}
