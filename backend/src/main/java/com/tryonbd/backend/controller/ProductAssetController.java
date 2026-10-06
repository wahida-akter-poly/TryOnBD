package com.tryonbd.backend.controller;

import java.io.IOException;
import java.nio.file.*;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Serve the real package files directly, including packages added after frontend build. */
@RestController
@RequestMapping("/assets/products")
public class ProductAssetController {
    private final Path directory;
    public ProductAssetController(@Value("${product.assets.directory:${PRODUCT_ASSET_DIRECTORY:../frontend/public/assets/products}}") String directory) {
        this.directory = Path.of(directory).toAbsolutePath().normalize();
    }
    @GetMapping("/{family}/{slug}/{filename}")
    public ResponseEntity<Resource> image(@PathVariable("family") String family, @PathVariable("slug") String slug, @PathVariable("filename") String filename) {
        if (!Set.of("eyewear", "clothing", "jewelry").contains(family)
                || !slug.matches("[a-z0-9]+(?:-[a-z0-9]+)*")
                || !filename.matches("[a-zA-Z0-9][a-zA-Z0-9._-]*\\.(png|webp)")) throw missing();
        try {
            Path root = directory.toRealPath();
            Path group = root.resolve(family), folder = group.resolve(slug), file = folder.resolve(filename);
            if (Files.isSymbolicLink(group) || Files.isSymbolicLink(folder) || Files.isSymbolicLink(file)
                    || !file.toRealPath().startsWith(root) || !file.toRealPath().equals(file.toAbsolutePath().normalize()) || !Files.isRegularFile(file)) throw missing();
            return ResponseEntity.ok().contentType(filename.endsWith(".webp") ? MediaType.parseMediaType("image/webp") : MediaType.IMAGE_PNG).cacheControl(CacheControl.noCache())
                .lastModified(Files.getLastModifiedTime(file).toMillis()).body(new FileSystemResource(file));
        } catch (IOException error) { throw missing(); }
    }
    private ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "Product asset not found"); }
}
