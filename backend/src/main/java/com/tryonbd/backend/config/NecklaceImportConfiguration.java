package com.tryonbd.backend.config;

import com.tryonbd.backend.service.NecklaceCatalogImportService;
import java.nio.file.*;
import java.util.Locale;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.*;

@Configuration
@Profile("necklace-import")
public class NecklaceImportConfiguration {
    @Bean
    ApplicationRunner importNecklaces(NecklaceCatalogImportService importer,
            ConfigurableApplicationContext context,
            @Value("${necklace.import.seller-id}") Long sellerId,
            @Value("${necklace.import.directory:../frontend/public/assets/jewelry/necklaces}") String directory) {
        return args -> {
            Path folder = Path.of(directory).toRealPath();
            java.util.List<String> filenames;
            try (var files = Files.list(folder)) {
                filenames = files.filter(Files::isRegularFile)
                        .filter(p -> p.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".png"))
                        .sorted().map(p -> {
                            try {
                                if (ImageIO.read(p.toFile()) == null) throw new IllegalArgumentException("Invalid PNG: " + p);
                            } catch (java.io.IOException e) { throw new IllegalArgumentException("Unreadable PNG: " + p, e); }
                            return p.getFileName().toString();
                        }).toList();
            }
            for (var product : importer.importFiles(sellerId, filenames)) {
                System.out.printf("NECKLACE_IMPORT id=%d name=%s categoryId=%d sellerId=%d imageUrl=%s arType=%s price=%s stock=%d%n",
                        product.id(), product.name(), product.categoryId(), product.sellerId(),
                        product.imageUrl(), product.arType(), product.price(), product.stockQuantity());
            }
            context.close();
        };
    }
}
