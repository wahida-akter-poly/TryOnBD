package com.tryonbd.backend.service;
import com.tryonbd.backend.model.*;
import com.tryonbd.backend.repository.*;
import com.tryonbd.backend.request.*;
import com.tryonbd.backend.response.*;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
@Service
@Transactional
public class PersistenceService {
    private final UserRepository userRepository;
    private final SellerRepository sellerRepository;
    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final TryOnSessionRepository tryOnSessionRepository;
    private final CartRepository cartRepository;
    private final OrderRepository orderRepository;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    public PersistenceService(UserRepository userRepository, SellerRepository sellerRepository, CategoryRepository categoryRepository, ProductRepository productRepository, TryOnSessionRepository tryOnSessionRepository, CartRepository cartRepository, OrderRepository orderRepository) {
        this.userRepository = userRepository;
        this.sellerRepository = sellerRepository;
        this.categoryRepository = categoryRepository;
        this.productRepository = productRepository;
        this.tryOnSessionRepository = tryOnSessionRepository;
        this.cartRepository = cartRepository;
        this.orderRepository = orderRepository;
    }
    public User currentUser() {
        var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in required");
        return userRepository.findByEmail(auth.getName()).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Account not found"));
    }
    private boolean admin() { String role = currentUser().getRole(); return "ADMIN".equals(role) || "SUPER_ADMIN".equals(role); }
    private void owned(User owner) { if (!owner.getId().equals(currentUser().getId()) && !admin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot access this record"); }
    private void manage(Product product) { if (!admin()) owned(product.getSeller().getUser()); }
    private String arType(String value) {
        String type = value == null ? "NONE" : value.trim().toUpperCase(java.util.Locale.ROOT);
        type = switch(type) { case "SUNGLASSES" -> "EYEWEAR"; case "CLOTHING" -> "SHIRT"; case "JEWELRY" -> "NECKLACE"; default -> type; };
        if (!java.util.Set.of("NONE","EYEWEAR","SHIRT","TSHIRT","NECKLACE").contains(type)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported AR type");
        return type;
    }
    public UserResponse me() { return UserResponse.from(currentUser()); }
    public SellerResponse sellerProfile() { return SellerResponse.from(sellerRepository.findFirstByUserIdOrderByIdAsc(currentUser().getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Seller profile not configured. Contact an administrator."))); }
    public List<ProductResponse> sellerProducts() { return productRepository.findBySellerUserId(currentUser().getId()).stream().map(ProductResponse::from).toList(); }
    private Cart myCart() {
        User user = currentUser(); userRepository.lockById(user.getId()).orElseThrow();
        return cartRepository.findByUserId(user.getId()).stream().findFirst().orElseGet(() -> { Cart cart = new Cart(); cart.setUser(user); return cartRepository.save(cart); });
    }
    public java.util.Map<String, Integer> cartItems() { return new java.util.TreeMap<>(myCart().getItems()); }
    public java.util.Map<String,Integer> addCartItem(Long productId, int quantity) {
        if (quantity < 1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quantity must be positive");
        Cart cart = myCart(); int existing = cart.getItems().getOrDefault(productId.toString(),0);
        if (quantity > Integer.MAX_VALUE-existing) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quantity is too large");
        return setCartItem(productId,existing+quantity);
    }
    public java.util.Map<String, Integer> setCartItem(Long productId, int quantity) {
        if (quantity < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quantity cannot be negative");
        Cart cart = myCart();
        if (quantity > 0) { Product product = require(productRepository,productId);
            if (quantity > product.getStockQuantity()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Insufficient stock");
        }
        var items = new java.util.TreeMap<>(cart.getItems());
        if (quantity == 0) items.remove(productId.toString()); else items.put(productId.toString(), quantity);
        cart.setItems(items); cartRepository.save(cart); return items;
    }
    public OrderResponse checkout() {
        Cart cart = myCart(); if (cart.getItems().isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Your cart is empty");
        java.math.BigDecimal total = java.math.BigDecimal.ZERO;
        var snapshots = new java.util.ArrayList<java.util.Map<String,Object>>();
        for (var entry : new java.util.TreeMap<>(cart.getItems()).entrySet()) {
            Product product = productRepository.lockById(Long.valueOf(entry.getKey())).orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "A cart product is no longer available"));
            int quantity = entry.getValue();
            if (quantity < 1 || quantity > product.getStockQuantity()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Insufficient stock for " + product.getName());
            total = total.add(product.getPrice().multiply(java.math.BigDecimal.valueOf(quantity)));
            snapshots.add(java.util.Map.of("productId", product.getId(), "name", product.getName(), "quantity", quantity, "price", product.getPrice(), "sellerId", product.getSeller().getId()));
            product.setStockQuantity(product.getStockQuantity() - quantity); productRepository.save(product);
        }
        Order order = new Order(); order.setUser(currentUser()); order.setItems(snapshots); order.setTotalAmount(total); order.setOrderStatus("PENDING");
        orderRepository.save(order); cart.setItems(new java.util.TreeMap<>()); cartRepository.save(cart); return OrderResponse.from(order);
    }
    public UserResponse changeRole(Long id, String role) {
        if (!"SUPER_ADMIN".equals(currentUser().getRole())) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Super admin required");
        if (role == null || !java.util.Set.of("CUSTOMER","SELLER","ADMIN","SUPER_ADMIN").contains(role)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid role");
        if (id.equals(currentUser().getId())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot change your own role");
        User user = require(userRepository,id); user.setRole(role); return UserResponse.from(userRepository.save(user));
    }
    private <T> T require(JpaRepository<T, Long> repository, Number id) {
        if (id == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Related ID is required");
        return repository.findById(id.longValue()).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "Record " + id + " not found"));
    }

    @Transactional(readOnly = true)
    public List<UserResponse> listUser() {
        return userRepository.findAll().stream().map(UserResponse::from).toList();
    }
    @Transactional(readOnly = true)
    public UserResponse getUser(Long id) { return UserResponse.from(require(userRepository, id)); }
    public void deleteUser(Long id) {
        User value = require(userRepository,id); protectAccount(value);
        if (value.getId().equals(currentUser().getId())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot delete your own account");
        userRepository.deleteById(id);
    }
    private void protectAccount(User value) { if (java.util.Set.of("ADMIN","SUPER_ADMIN").contains(value.getRole()) && !"SUPER_ADMIN".equals(currentUser().getRole())) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Super admin required to manage administrator accounts"); }
    public UserResponse createUser(CreateUserRequest request) {
        User value = new User();
        value.setFullName(request.getFullName());
        value.setEmail(request.getEmail());
        value.setPassword(encoder.encode(request.getPassword()));
        value.setPhone(request.getPhone());
        value.setAddress(request.getAddress());
        value.setRole("CUSTOMER");
        return UserResponse.from(userRepository.save(value));
    }
    public UserResponse updateUser(Long id, UpdateUserRequest request) {
        User value = require(userRepository, id); protectAccount(value);
        value.setFullName(request.getFullName());
        value.setEmail(request.getEmail());
        value.setPhone(request.getPhone());
        value.setAddress(request.getAddress());
        return UserResponse.from(userRepository.save(value));
    }

    @Transactional(readOnly = true)
    public List<SellerResponse> listSeller() {
        return sellerRepository.findAll().stream().map(SellerResponse::from).toList();
    }
    @Transactional(readOnly = true)
    public SellerResponse getSeller(Long id) { return SellerResponse.from(require(sellerRepository, id)); }
    public void deleteSeller(Long id) { require(sellerRepository, id); sellerRepository.deleteById(id); }
    public SellerResponse createSeller(CreateSellerRequest request) {
        Seller value = new Seller();
        User user = require(userRepository, request.getUserId());
        if (sellerRepository.existsByUserId(user.getId())) throw new ResponseStatusException(HttpStatus.CONFLICT, "User already has a seller profile");
        if ("CUSTOMER".equals(user.getRole())) { user.setRole("SELLER"); userRepository.save(user); }
        value.setUser(user);
        value.setBusinessName(request.getBusinessName());
        value.setContactEmail(request.getContactEmail());
        value.setPhone(request.getPhone());
        value.setSubscriptionStatus(request.getSubscriptionStatus());
        return SellerResponse.from(sellerRepository.save(value));
    }
    public SellerResponse updateSeller(Long id, UpdateSellerRequest request) {
        Seller value = require(sellerRepository, id);
        value.setBusinessName(request.getBusinessName());
        value.setContactEmail(request.getContactEmail());
        value.setPhone(request.getPhone());
        value.setSubscriptionStatus(request.getSubscriptionStatus());
        return SellerResponse.from(sellerRepository.save(value));
    }

    @Transactional(readOnly = true)
    public List<CategoryResponse> listCategory() {
        return categoryRepository.findAll().stream().map(CategoryResponse::from).toList();
    }
    @Transactional(readOnly = true)
    public CategoryResponse getCategory(Long id) { return CategoryResponse.from(require(categoryRepository, id)); }
    public void deleteCategory(Long id) { require(categoryRepository, id); categoryRepository.deleteById(id); }
    public CategoryResponse createCategory(CreateCategoryRequest request) {
        Category value = new Category();
        value.setCategoryName(request.getCategoryName());
        value.setDescription(request.getDescription());
        value.setParentCategory(request.getParentCategoryId() == null ? null : require(categoryRepository, request.getParentCategoryId()));
        return CategoryResponse.from(categoryRepository.save(value));
    }
    public CategoryResponse updateCategory(Long id, UpdateCategoryRequest request) {
        Category value = require(categoryRepository, id);
        value.setCategoryName(request.getCategoryName());
        value.setDescription(request.getDescription());
        if (request.getParentCategoryId() != null && id.equals(request.getParentCategoryId().longValue())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category cannot be its own parent");
        Category parent = request.getParentCategoryId() == null ? null : require(categoryRepository,request.getParentCategoryId());
        Category cursor = parent; var visited = new java.util.HashSet<Long>();
        while (cursor != null) { if (id.equals(cursor.getId()) || !visited.add(cursor.getId())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category hierarchy cannot contain a cycle"); cursor = cursor.getParentCategory(); }
        value.setParentCategory(parent);
        return CategoryResponse.from(categoryRepository.save(value));
    }

    @Transactional(readOnly = true)
    public List<ProductResponse> listProduct() {
        return productRepository.findAll().stream().map(ProductResponse::from).toList();
    }
    @Transactional(readOnly = true)
    public ProductResponse getProduct(Long id) { return ProductResponse.from(require(productRepository, id)); }
    public void deleteProduct(Long id) { manage(require(productRepository, id)); productRepository.deleteById(id); }
    public ProductResponse createProduct(CreateProductRequest request) {
        Product value = new Product();
        value.setName(request.getName());
        value.setDescription(request.getDescription());
        value.setPrice(request.getPrice());
        value.setImageUrl(request.getImageUrl());
        value.setArType(arType(request.getArType()));
        value.setStockQuantity(request.getStockQuantity());
        value.setCategory(require(categoryRepository, request.getCategoryId()));
        Seller seller = admin() ? require(sellerRepository, request.getSellerId()) : require(sellerRepository, sellerProfile().id());
        value.setSeller(seller);
        return ProductResponse.from(productRepository.save(value));
    }
    public ProductResponse updateProduct(Long id, UpdateProductRequest request) {
        Product value = productRepository.lockById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found"));
        manage(value);
        value.setName(request.getName());
        value.setDescription(request.getDescription());
        value.setPrice(request.getPrice());
        value.setImageUrl(request.getImageUrl());
        value.setArType(arType(request.getArType()));
        value.setStockQuantity(request.getStockQuantity());
        value.setCategory(require(categoryRepository, request.getCategoryId()));
        return ProductResponse.from(productRepository.save(value));
    }

    @Transactional(readOnly = true)
    public List<TryOnSessionResponse> listTryOnSession() {
        User user = currentUser();
        return tryOnSessionRepository.findByUserId(user.getId()).stream().map(TryOnSessionResponse::from).toList();
    }
    @Transactional(readOnly = true)
    public TryOnSessionResponse getTryOnSession(Long id) { var v = require(tryOnSessionRepository, id); owned(v.getUser()); return TryOnSessionResponse.from(v); }
    public void deleteTryOnSession(Long id) { owned(require(tryOnSessionRepository, id).getUser()); tryOnSessionRepository.deleteById(id); }
    public TryOnSessionResponse createTryOnSession(CreateTryOnSessionRequest request) {
        TryOnSession value = new TryOnSession();
        value.setUser(currentUser());
        value.setProduct(require(productRepository, request.getProductId()));
        String type = arType(value.getProduct().getArType());
        if ("NONE".equals(type)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Product does not support try-on");
        value.setTryOnType(type);
        value.setInputImageUrl(request.getInputImageUrl());
        return TryOnSessionResponse.from(tryOnSessionRepository.save(value));
    }
    public TryOnSessionResponse updateTryOnSession(Long id, UpdateTryOnResultRequest request) {
        TryOnSession value = require(tryOnSessionRepository, id); owned(value.getUser());
        value.setResultImageUrl(request.getResultImageUrl());
        return TryOnSessionResponse.from(tryOnSessionRepository.save(value));
    }

    @Transactional(readOnly = true)
    public List<CartResponse> listCart() {
        User user = currentUser();
        return cartRepository.findByUserId(user.getId()).stream().map(CartResponse::from).toList();
    }
    @Transactional(readOnly = true)
    public CartResponse getCart(Long id) { var cart = require(cartRepository,id); owned(cart.getUser()); return CartResponse.from(cart); }
    public void deleteCart(Long id) { owned(require(cartRepository,id).getUser()); cartRepository.deleteById(id); }
    public CartResponse createCart(CreateCartRequest request) { return CartResponse.from(myCart()); }

    @Transactional(readOnly = true)
    public List<OrderResponse> listOrder() {
        boolean all = admin(); User user = currentUser();
        return (all ? orderRepository.findAll() : orderRepository.findByUserId(user.getId())).stream().map(OrderResponse::from).toList();
    }
    @Transactional(readOnly = true)
    public OrderResponse getOrder(Long id) { var v = require(orderRepository,id); owned(v.getUser()); return OrderResponse.from(v); }
    public void deleteOrder(Long id) { throw new ResponseStatusException(HttpStatus.METHOD_NOT_ALLOWED, "Order records are retained"); }
    public OrderResponse createOrder(CreateOrderRequest request) { return checkout(); }
    public OrderResponse updateOrder(Long id, UpdateOrderStatusRequest request) {
        if (!admin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin required");
        if (!java.util.Set.of("PENDING","CONFIRMED","SHIPPED","DELIVERED").contains(request.getOrderStatus())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid order status");
        Order value = require(orderRepository, id);
        value.setOrderStatus(request.getOrderStatus());
        return OrderResponse.from(orderRepository.save(value));
    }
}
