package com.tryonbd.backend.service;

import java.awt.image.BufferedImage;
import java.math.BigDecimal;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Filesystem-only validation: no database writes or filename-derived business values. */
public record ProductAssetPackage(String key, boolean draft, Long sellerId, Long existingProductId,
        String name, String description, BigDecimal price, Integer stockQuantity, String category,
        String arType, String imageUrl, Map<String, Object> arMetadata) {
    private static final Set<String> FIELDS = Set.of("draft", "sellerId", "existingProductId", "name",
        "description", "price", "stockQuantity", "category", "arType", "style", "frontAsset",
        "leftTempleAsset", "rightTempleAsset", "fitProfile");
    private static final Map<String, Set<String>> TYPES = Map.of(
        "eyewear", Set.of("EYEWEAR"), "clothing", Set.of("SHIRT", "TSHIRT", "CLOTHING"),
        "jewelry", Set.of("NECKLACE"));
    private static final JsonMapper JSON = JsonMapper.builder()
        .enable(tools.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();

    public static List<ProductAssetPackage> discover(Path directory) throws Exception {
        if (!Files.isDirectory(directory)) throw new IllegalArgumentException("Product directory does not exist: " + directory);
        Path root = directory.toRealPath();
        List<ProductAssetPackage> result = new ArrayList<>();
        try (var families = Files.list(root)) {
            for (Path family : families.sorted().toList()) {
                if (!Files.isDirectory(family)) continue;
                String group = family.getFileName().toString();
                if (!TYPES.containsKey(group)) throw new IllegalArgumentException("Unknown product family: " + group);
                confined(root, family);
                try (var folders = Files.list(family)) {
                    for (Path folder : folders.filter(Files::isDirectory).sorted().toList()) {
                        String slug = folder.getFileName().toString();
                        if (!slug.matches("[a-z0-9]+(?:-[a-z0-9]+)*") || slug.length() > 120)
                            throw new IllegalArgumentException("Use a lowercase product slug: " + folder);
                        confined(root, folder);
                        try { result.add(read(root, folder, group + "/" + slug, group)); }
                        catch (Exception error) { throw new IllegalArgumentException(group + "/" + slug + ": " + error.getMessage(), error); }
                    }
                }
            }
        }
        return List.copyOf(result);
    }

    private static ProductAssetPackage read(Path root, Path folder, String key, String group) throws Exception {
        Path manifest = folder.resolve("product.json");
        confined(folder, manifest);
        if (Files.size(manifest) > 65536) throw new IllegalArgumentException("product.json exceeds 64KB");
        JsonNode json = JSON.readTree(Files.readString(manifest));
        if (json == null || !json.isObject()) throw new IllegalArgumentException("product.json must be an object");
        for (String field : json.properties().stream().map(Map.Entry::getKey).toList())
            if (!FIELDS.contains(field)) throw new IllegalArgumentException("Unknown field: " + field);
        boolean draft = false;
        if (json.has("draft")) {
            if (!json.get("draft").isBoolean()) throw new IllegalArgumentException("draft must be boolean");
            draft = json.get("draft").asBoolean();
        }
        String type = text(json, "arType", true, 20).toUpperCase(Locale.ROOT);
        if (!TYPES.get(group).contains(type)) throw new IllegalArgumentException("Unsupported arType for " + group + ": " + type);
        String front = image(root, folder, key, json, "frontAsset", "front.png");
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("frontAsset", front);
        if (type.equals("EYEWEAR")) {
            for (String part : List.of("leftTempleAsset", "rightTempleAsset")) {
                String conventional = part.equals("leftTempleAsset") ? "left-temple.png" : "right-temple.png";
                if (json.has(part) && !json.get(part).isNull() || Files.exists(folder.resolve(conventional)))
                    metadata.put(part, image(root, folder, key, json, part, conventional));
            }
            if (new HashSet<>(metadata.values()).size() != metadata.size())
                throw new IllegalArgumentException("Front and temples must be distinct real assets");
        } else if (json.has("leftTempleAsset") || json.has("rightTempleAsset")) {
            throw new IllegalArgumentException("Temple assets are supported only for EYEWEAR");
        }
        if (json.has("style")) {
            String style = text(json, "style", true, 20).toUpperCase(Locale.ROOT);
            if (!type.equals("NECKLACE") || !Set.of("CHOKER", "SHORT", "PENDANT").contains(style))
                throw new IllegalArgumentException("Necklace style must be CHOKER, SHORT or PENDANT");
            metadata.put("style", style);
        }
        if (json.has("fitProfile")) {
            if (!json.get("fitProfile").isObject()) throw new IllegalArgumentException("fitProfile must be an object");
            Map<String, Object> fit = JSON.convertValue(json.get("fitProfile"), Map.class);
            ProductFitValidation.validate(type, fit);
            metadata.put("fitProfile", fit);
        }
        Long seller = positiveId(json, "sellerId"), existing = positiveId(json, "existingProductId");
        if (draft) return new ProductAssetPackage(key, true, seller, existing, null, null, null, null, null, type, front, metadata);
        String name = text(json, "name", true, 255), description = text(json, "description", false, 255);
        if (!json.has("description") || !json.get("description").isTextual())
            throw new IllegalArgumentException("description is required (seller-supplied text, empty is allowed)");
        String category = text(json, "category", true, 255);
        JsonNode price = json.get("price"), stock = json.get("stockQuantity");
        if (price == null || !price.isNumber() || price.decimalValue().signum() < 0
                || price.decimalValue().stripTrailingZeros().scale() > 2 || price.decimalValue().precision() > 19 || price.decimalValue().precision() - price.decimalValue().scale() > 17)
            throw new IllegalArgumentException("price must be a non-negative number with at most two decimal places");
        if (stock == null || !stock.isIntegralNumber() || !stock.canConvertToInt() || stock.intValue() < 0)
            throw new IllegalArgumentException("stockQuantity must be a non-negative integer");
        return new ProductAssetPackage(key, false, seller, existing, name, description, price.decimalValue(),
            stock.intValue(), category, type, front, Collections.unmodifiableMap(metadata));
    }
    private static String text(JsonNode json, String field, boolean required, int max) {
        JsonNode node = json.get(field);
        if (node == null || !node.isTextual()) {
            if (required) throw new IllegalArgumentException(field + " must be supplied as text");
            return "";
        }
        String value = node.asText().trim();
        if (value.length() > max || required && value.isBlank()) throw new IllegalArgumentException("Invalid " + field);
        return value;
    }
    private static Long positiveId(JsonNode json, String key) {
        JsonNode node = json.get(key);
        if (node == null) return null;
        if (!node.isIntegralNumber() || !node.canConvertToLong() || node.longValue() <= 0)
            throw new IllegalArgumentException(key + " must be an existing positive ID");
        return node.longValue();
    }
    private static void confined(Path root, Path path) throws Exception {
        if (!path.toRealPath().startsWith(root.toRealPath())) throw new IllegalArgumentException("Asset escapes product directory: " + path);
        // Refuse aliases: two symlinked folders must not produce duplicate managed products.
        if (Files.isSymbolicLink(path) || !path.toRealPath().equals(path.toAbsolutePath().normalize())) throw new IllegalArgumentException("Symlinks are not product assets: " + path);
    }
    private static String image(Path root, Path folder, String key, JsonNode json, String field, String fallback) throws Exception {
        String filename = json.has(field) ? text(json, field, true, 120) : fallback;
        if (!filename.matches("[a-zA-Z0-9][a-zA-Z0-9._-]*\\.png"))
            throw new IllegalArgumentException(field + " must name a local PNG file");
        Path path = folder.resolve(filename);
        confined(root, path); confined(folder, path);
        if (Files.size(path) > 20L * 1024 * 1024) throw new IllegalArgumentException("PNG exceeds 20MB: " + filename);
        byte[] signature;
        try (var stream = Files.newInputStream(path)) { signature = stream.readNBytes(8); }
        if (!Arrays.equals(signature, new byte[]{(byte)137,80,78,71,13,10,26,10})) throw new IllegalArgumentException("Not a PNG: " + filename);
        // Inspect dimensions before decoding to avoid unbounded allocation from malformed images.
        try (var input = ImageIO.createImageInputStream(path.toFile())) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new IllegalArgumentException("Invalid PNG: " + filename);
            var reader = readers.next();
            try {
                reader.setInput(input);
                int w = reader.getWidth(0), h = reader.getHeight(0);
                if (w < 1 || h < 1 || (long)w * h > 24000000) throw new IllegalArgumentException("PNG exceeds 24 megapixels");
                BufferedImage image = reader.read(0);
                boolean transparent = false, visible = false;
                for (int y = 0; y < h && !(transparent && visible); y++)
                    for (int x = 0; x < w && !(transparent && visible); x++) {
                        int alpha = image.getRGB(x, y) >>> 24;
                        transparent |= alpha == 0; visible |= alpha > 0;
                    }
                if (!transparent || !visible) throw new IllegalArgumentException("PNG must contain a visible product and transparent background: " + filename);
            } finally { reader.dispose(); }
        }
        return "/assets/products/" + key + "/" + filename;
    }
}
