package com.tryonbd.backend.config;

import com.tryonbd.backend.service.*;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.*;

@Configuration
@Profile("product-sync")
public class ProductSyncConfiguration {
    @Bean ApplicationRunner syncProducts(ProductAssetSyncService importer, ConfigurableApplicationContext context,
            @Value("${product.assets.directory:${PRODUCT_ASSET_DIRECTORY:../frontend/public/assets/products}}") String directory,
            @Value("${PRODUCT_SYNC_SELLER_ID:0}") Long defaultSeller,
            @Value("${product.sync.dry-run:false}") boolean dryRun) {
        return args -> {
            var packages = ProductAssetPackage.discover(Path.of(directory));
            var results = importer.sync(packages, defaultSeller > 0 ? defaultSeller : null, dryRun);
            for (var result : results) System.out.printf("PRODUCT_SYNC key=%s action=%s id=%s %s%n",
                result.key(), result.action(), result.productId(), result.detail());
            System.out.printf("PRODUCT_SYNC discovered=%d dryRun=%s%n", packages.size(), dryRun);
            context.close();
        };
    }
}
