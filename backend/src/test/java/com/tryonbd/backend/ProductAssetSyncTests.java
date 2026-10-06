package com.tryonbd.backend;

import com.tryonbd.backend.model.*;
import com.tryonbd.backend.repository.*;
import com.tryonbd.backend.service.*;
import java.awt.image.BufferedImage;
import java.math.BigDecimal;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:production;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "spring.datasource.driver-class-name=org.h2.Driver", "spring.jpa.hibernate.ddl-auto=create-drop"})
@Transactional
class ProductAssetSyncTests {
    @Autowired ProductAssetSyncService sync;
    @Autowired ProductRepository products;
    @Autowired CategoryRepository categories;
    @Autowired SellerRepository sellers;
    @Autowired UserRepository users;
    @Autowired jakarta.persistence.EntityManager entities;
    @TempDir Path root;
    Seller seller;
    final JsonMapper json = new JsonMapper();
    @BeforeEach void setup() {
        User user = new User(); user.setFullName("Importer test owner"); user.setEmail("importer@test.example");
        user.setPassword("test-only-hash"); user.setRole("SELLER"); users.save(user);
        seller = new Seller(); seller.setUser(user); seller.setBusinessName("Importer test seller"); sellers.save(seller);
    }
    Map<String, Object> manifest(String type) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", "Seller supplied name"); m.put("description", "Seller supplied description");
        m.put("price", 2899); m.put("stockQuantity", 12); m.put("category", "Jewelry"); m.put("arType", type);
        m.put("sellerId", seller.getId()); return m;
    }
    Path folder(String group, String slug, Map<String, Object> m) throws Exception {
        Path p = root.resolve(group).resolve(slug); Files.createDirectories(p);
        png(p.resolve("front.png")); write(p, m); return p;
    }
    void png(Path file) throws Exception { BufferedImage image = new BufferedImage(4, 4, BufferedImage.TYPE_INT_ARGB); image.setRGB(1,1,0xff998877); ImageIO.write(image, "png", file.toFile()); }
    void write(Path folder, Map<String, Object> m) throws Exception { Files.writeString(folder.resolve("product.json"), json.writeValueAsString(m)); }
    List<ProductAssetPackage> discover() throws Exception { return ProductAssetPackage.discover(root); }
    @Test void legacyPackageMigrationKeepsIdsBusinessValuesAndSalesOnRepeatSync() throws Exception {
        Category category=new Category();category.setCategoryName("Jewelry");category.setDescription("Unchanged category");categories.save(category);
        List<Long> ids=new ArrayList<>();
        for(int i=1;i<=5;i++) {
            Product product=new Product();product.setName("Existing product "+i);product.setDescription("Existing description "+i);
            product.setPrice(BigDecimal.valueOf(i*100));product.setStockQuantity(i*3);product.setArType("NECKLACE");
            product.setImageUrl("/legacy/"+i+".png");product.setCategory(category);product.setSeller(seller);products.saveAndFlush(product);
            ids.add(product.getId());var m=manifest("NECKLACE");m.put("name",product.getName());m.put("description",product.getDescription());
            m.put("price",i*100);m.put("stockQuantity",i*3);m.put("existingProductId",product.getId());m.put("style",i==5?"CHOKER":"SHORT");
            folder("jewelry","existing-"+i,m);
        }
        long count=products.count();var first=sync.sync(discover(),null,false);
        assertEquals(ids,first.stream().map(ProductAssetSyncService.Result::productId).toList());
        assertTrue(first.stream().allMatch(result->result.action().equals("UPDATED")));entities.flush();entities.clear();
        for(int i=1;i<=5;i++) {
            Product product=products.findById(ids.get(i-1)).orElseThrow();assertEquals("Existing product "+i,product.getName());
            assertEquals("Existing description "+i,product.getDescription());assertEquals(0,BigDecimal.valueOf(i*100).compareTo(product.getPrice()));
            assertEquals(i*3,product.getStockQuantity());assertEquals(category.getId(),product.getCategory().getId());
            assertEquals(seller.getId(),product.getSeller().getId());assertEquals("NECKLACE",product.getArType());
            assertEquals("/assets/products/jewelry/existing-"+i+"/front.png",product.getImageUrl());
        }
        Product sold=products.findById(ids.getFirst()).orElseThrow();sold.setStockQuantity(1);products.saveAndFlush(sold);entities.clear();
        var second=sync.sync(discover(),null,false);assertEquals(count,products.count());
        assertTrue(second.stream().allMatch(result->result.action().equals("UNCHANGED")));
        assertEquals(ids,second.stream().map(ProductAssetSyncService.Result::productId).toList());
        assertEquals(1,products.findById(ids.getFirst()).orElseThrow().getStockQuantity());assertEquals(1,categories.count());
    }

    @Test void eyewearTempleCalibrationPersistsThroughTheExistingIdempotentSync() throws Exception {
        var m=manifest("EYEWEAR");m.put("category","Eyewear");
        var fit=Map.of("templeDepth",.62,"templeSplay",.025,"templeCurve",.065,"templeRootLength",.18,"templeVerticalOffset",.012);
        m.put("fitProfile",fit);m.put("leftTempleAsset","left-temple.png");m.put("rightTempleAsset","right-temple.png");
        var p=folder("eyewear","measured-frame",m);png(p.resolve("left-temple.png"));png(p.resolve("right-temple.png"));
        var first=sync.sync(discover(),null,false).getFirst();entities.flush();entities.clear();
        var second=sync.sync(discover(),null,false).getFirst();
        assertEquals(first.productId(),second.productId());assertEquals("UNCHANGED",second.action());assertEquals(1,products.count());
        var stored=(Map<?,?>)products.findById(first.productId()).orElseThrow().getArMetadata().get("fitProfile");
        for(var e:fit.entrySet())assertEquals(e.getValue(),((Number)stored.get(e.getKey())).doubleValue(),1e-10);
    }
    @Test void eyewearRejectsUnsafeOrUnsupportedTempleCalibrationBeforeSync() throws Exception {
        var m=manifest("EYEWEAR");m.put("category","Eyewear");var p=folder("eyewear","invalid-fit",m);
        for(var fit:List.of(Map.of("templeCurve",0),Map.of("templeCurve",.13),Map.of("templeRootLength",.01),
            Map.of("templeRootLength",.4),Map.of("templeVerticalOffset",-.1),Map.of("templeVerticalOffset",.1),Map.of("forceVisible",1))) {
            m.put("fitProfile",fit);write(p,m);assertThrows(IllegalArgumentException.class,()->discover());
        }
        assertEquals(0,products.count());
    }
    @Test void repeatRunKeepsIdentityAndReportsUnchangedAfterDatabaseReload() throws Exception {
        var m = manifest("NECKLACE"); m.put("style", "CHOKER"); m.put("fitProfile", Map.of("widthRatio", .8)); folder("jewelry", "choker", m);
        var first = sync.sync(discover(), null, false).getFirst(); entities.flush(); entities.clear();
        var second = sync.sync(discover(), null, false).getFirst();
        assertEquals(first.productId(), second.productId()); assertEquals("UNCHANGED", second.action()); assertEquals(1, products.count());
        assertEquals("CHOKER", products.findById(first.productId()).orElseThrow().getArMetadata().get("style"));
    }
    @Test void managedUpdateUsesSameRowAndChangingFrontFilenameDoesNotDuplicate() throws Exception {
        var m = manifest("NECKLACE"); Path p = folder("jewelry", "managed", m); Long id = sync.sync(discover(), null, false).getFirst().productId();
        png(p.resolve("another-front.png")); m.put("frontAsset", "another-front.png"); m.put("price", 3100); write(p,m);
        var result = sync.sync(discover(), null, false).getFirst(); assertEquals(id,result.productId()); assertEquals("UPDATED",result.action());
        assertEquals(1,products.count()); assertEquals(new BigDecimal("3100"), products.findById(id).orElseThrow().getPrice());
    }
    @Test void caseInsensitiveCategoryLookupPreservesExistingCategory() throws Exception {
        Category c = new Category(); c.setCategoryName("Jewelry"); c.setDescription("Unchanged category"); categories.save(c);
        var m=manifest("NECKLACE"); m.put("category"," jewelry "); folder("jewelry","one",m);
        var result=sync.sync(discover(),null,false).getFirst(); assertEquals(c.getId(),products.findById(result.productId()).orElseThrow().getCategory().getId());
        assertEquals(1,categories.count()); assertEquals("Unchanged category",c.getDescription());
    }
    @Test void ambiguousCategoriesRefuseImport() throws Exception {
        for(String name:List.of("Jewelry","jewelry")){Category c=new Category();c.setCategoryName(name);categories.save(c);}
        folder("jewelry","one",manifest("NECKLACE")); assertThrows(IllegalArgumentException.class,()->sync.sync(discover(),null,false)); assertEquals(0,products.count());
    }
    @Test void dryRunCreatesNeitherCategoriesNorProducts() throws Exception {
        folder("jewelry","one",manifest("NECKLACE")); assertEquals("WOULD_CREATE",sync.sync(discover(),null,true).getFirst().action());
        assertEquals(0,categories.count());assertEquals(0,products.count());
    }
    @Test void globalSellerIsExplicitAndMustAlreadyExist() throws Exception {
        var m=manifest("NECKLACE");m.remove("sellerId");folder("jewelry","one",m);
        assertThrows(IllegalArgumentException.class,()->sync.sync(discover(),null,false));
        assertThrows(IllegalArgumentException.class,()->sync.sync(discover(),999999L,false));
        Long id=sync.sync(discover(),seller.getId(),false).getFirst().productId();assertEquals(seller.getId(),products.findById(id).orElseThrow().getSeller().getId());
    }
    @Test void managedSellerCannotBeChanged() throws Exception {
        var m=manifest("NECKLACE");Path p=folder("jewelry","one",m);sync.sync(discover(),null,false);
        Seller other=new Seller();other.setUser(seller.getUser());other.setBusinessName("Other");sellers.save(other);m.put("sellerId",other.getId());write(p,m);
        assertThrows(IllegalArgumentException.class,()->sync.sync(discover(),null,false));
    }
    @Test void repeatedPackageKeysAreRejected() throws Exception {
        folder("jewelry","one",manifest("NECKLACE"));var p=discover().getFirst();
        assertThrows(IllegalArgumentException.class,()->sync.sync(List.of(p,p),null,false));assertEquals(0,products.count());
    }
    @Test void unrelatedExistingProductsAndLegacyFourArePreserved() throws Exception {
        Category c=new Category();c.setCategoryName("Clothing");categories.save(c);List<Product> legacy=new ArrayList<>();
        for(int i=1;i<=4;i++){Product p=new Product();p.setName("Existing "+i);p.setPrice(BigDecimal.valueOf(i));p.setStockQuantity(i);p.setImageUrl("/old/"+i+".png");p.setArType("SHIRT");p.setSeller(seller);p.setCategory(c);products.save(p);legacy.add(p);}
        folder("jewelry","one",manifest("NECKLACE"));sync.sync(discover(),null,false);entities.flush();entities.clear();
        for(int i=1;i<=4;i++){Product p=products.findById(legacy.get(i-1).getId()).orElseThrow();assertNull(p.getAssetKey());assertNull(p.getArMetadata());assertEquals("Existing "+i,p.getName());assertEquals("/old/"+i+".png",p.getImageUrl());assertEquals(i,p.getStockQuantity());assertEquals(0,BigDecimal.valueOf(i).compareTo(p.getPrice()));}
    }
    @Test void imageCollisionCannotAdoptAnUnrelatedProduct() throws Exception {
        folder("jewelry","one",manifest("NECKLACE"));var pkg=discover().getFirst();Category c=new Category();c.setCategoryName("Jewelry");categories.save(c);
        Product p=new Product();p.setName("Unrelated");p.setPrice(BigDecimal.ONE);p.setStockQuantity(1);p.setArType("NECKLACE");p.setImageUrl(pkg.imageUrl());p.setSeller(seller);p.setCategory(c);products.save(p);
        assertThrows(IllegalArgumentException.class,()->sync.sync(List.of(pkg),null,false));assertNull(p.getAssetKey());assertEquals("Unrelated",p.getName());
    }
    @Test void missingTemplePairAllowsCatalogOnlyAndCompletePartsResolveOwnUrls() throws Exception {
        Path p=folder("eyewear","one",manifest("EYEWEAR"));var result=sync.sync(discover(),null,false).getFirst();assertTrue(result.detail().contains("Catalog only"));
        png(p.resolve("left-temple.png"));png(p.resolve("right-temple.png"));result=sync.sync(discover(),null,false).getFirst();
        assertEquals("AR available",result.detail());var metadata=products.findById(result.productId()).orElseThrow().getArMetadata();
        assertEquals("/assets/products/eyewear/one/left-temple.png",metadata.get("leftTempleAsset"));assertEquals("/assets/products/eyewear/one/right-temple.png",metadata.get("rightTempleAsset"));
    }
    @Test void shirtAndTshirtPackagesResolveDynamicFrontImages() throws Exception {
        for(String type:List.of("SHIRT","TSHIRT","CLOTHING")){var m=manifest(type);m.put("category","Clothing");folder("clothing",type.toLowerCase(),m);}
        sync.sync(discover(),null,false);assertEquals(3,products.count());for(var p:products.findAll())assertEquals("/assets/products/clothing/"+p.getArType().toLowerCase()+"/front.png",p.getImageUrl());
    }
    @Test void draftDoesNotInventPriceStockOrCategory() throws Exception {
        var m=manifest("NECKLACE");m.put("draft",true);m.put("price",null);m.put("stockQuantity",null);m.put("name","");folder("jewelry","draft",m);
        assertEquals("SKIPPED",sync.sync(discover(),null,false).getFirst().action());assertEquals(0,products.count());assertEquals(0,categories.count());
    }
    @Test void malformedBusinessFieldsAndTypesAreRejectedBeforeWrites() throws Exception {
        Path p=folder("jewelry","one",manifest("NECKLACE"));
        for(var change:List.of(Map.of("price",-1),Map.of("price",2.001),Map.of("price",1e30),Map.of("stockQuantity",-1),Map.of("stockQuantity",1.5),Map.of("arType","UNKNOWN"),Map.of("name",""),Map.of("style","BAD"),Map.of("fitProfile",Map.of("widthRatio",50)))){
            var m=manifest("NECKLACE");m.putAll(change);write(p,m);assertThrows(IllegalArgumentException.class,this::discover,change.toString());
        }
        var m=manifest("NECKLACE");m.remove("price");write(p,m);assertThrows(IllegalArgumentException.class,this::discover);assertEquals(0,products.count());
    }
    @Test void missingImagesInvalidPngAndTraversalAreRejected() throws Exception {
        Path p=folder("jewelry","one",manifest("NECKLACE"));Files.delete(p.resolve("front.png"));assertThrows(IllegalArgumentException.class,this::discover);
        Files.writeString(p.resolve("front.png"),"not a png");assertThrows(IllegalArgumentException.class,this::discover);
        var m=manifest("NECKLACE");m.put("frontAsset","../other.png");write(p,m);assertThrows(IllegalArgumentException.class,this::discover);
    }
    @Test void invisibleOrOpaqueImagesAreRejectedAndJsonTyposOrDuplicateFieldsFail() throws Exception {
        Path p=folder("jewelry","one",manifest("NECKLACE"));ImageIO.write(new BufferedImage(4,4,BufferedImage.TYPE_INT_ARGB),"png",p.resolve("front.png").toFile());assertThrows(IllegalArgumentException.class,this::discover);
        ImageIO.write(new BufferedImage(4,4,BufferedImage.TYPE_INT_RGB),"png",p.resolve("front.png").toFile());assertThrows(IllegalArgumentException.class,this::discover);
        png(p.resolve("front.png"));var m=manifest("NECKLACE");m.put("prcie",10);write(p,m);assertThrows(IllegalArgumentException.class,this::discover);
        Files.writeString(p.resolve("product.json"),"{\"arType\":\"NECKLACE\",\"arType\":\"SHIRT\"}");assertThrows(IllegalArgumentException.class,this::discover);
    }

    @Test void unchangedManifestPreservesSellerEditsAndCheckoutStockAndOnlyChangedFieldsSync() throws Exception {
        var m=manifest("NECKLACE");Path p=folder("jewelry","one",m);Long id=sync.sync(discover(),null,false).getFirst().productId();
        Product product=products.findById(id).orElseThrow();product.setName("Seller edited name");product.setPrice(new BigDecimal("3200"));product.setStockQuantity(10);products.saveAndFlush(product);entities.clear();
        assertEquals("UNCHANGED",sync.sync(discover(),null,false).getFirst().action());
        m.put("description","Updated approved description");write(p,m);assertEquals("UPDATED",sync.sync(discover(),null,false).getFirst().action());
        entities.flush();entities.clear();product=products.findById(id).orElseThrow();assertEquals("Seller edited name",product.getName());assertEquals(0,new BigDecimal("3200").compareTo(product.getPrice()));assertEquals(10,product.getStockQuantity());assertEquals("Updated approved description",product.getDescription());
        m.put("stockQuantity",20);write(p,m);sync.sync(discover(),null,false);assertEquals(20,products.findById(id).orElseThrow().getStockQuantity());
    }

    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    @Test void conflictAfterFirstProductRollsBackEntireBatch() throws Exception {
        long beforeProducts=products.count(), beforeCategories=categories.count(), beforeUsers=users.count();
        var transaction=new org.springframework.transaction.support.TransactionTemplate(transactions);
        transaction.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        assertThrows(IllegalArgumentException.class,()->transaction.execute(status->{
            User user=new User();user.setEmail("atomic-import@test.example");user.setFullName("Test-only owner");user.setPassword("test-only");user.setRole("SELLER");users.saveAndFlush(user);
            Seller owner=new Seller();owner.setUser(user);owner.setBusinessName("Test-only owner");sellers.saveAndFlush(owner);
            try {
                var first=manifest("NECKLACE");first.put("sellerId",owner.getId());folder("jewelry","a-first",first);
                var second=manifest("NECKLACE");second.put("sellerId",owner.getId());second.put("existingProductId",999999);folder("jewelry","z-conflict",second);
                return sync.sync(discover(),null,false);
            }catch(java.io.IOException error){throw new RuntimeException(error);}catch(IllegalArgumentException error){throw error;}catch(Exception error){throw new RuntimeException(error);}
        }));
        assertEquals(beforeProducts,products.count());assertEquals(beforeCategories,categories.count());assertEquals(beforeUsers,users.count());
    }
}
