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
    public void deleteUser(Long id) { require(userRepository, id); userRepository.deleteById(id); }
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
        User value = require(userRepository, id);
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
        value.setUser(require(userRepository, request.getUserId()));
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
        value.setParentCategory(request.getParentCategoryId() == null ? null : require(categoryRepository, request.getParentCategoryId()));
        return CategoryResponse.from(categoryRepository.save(value));
    }

    @Transactional(readOnly = true)
    public List<ProductResponse> listProduct() {
        return productRepository.findAll().stream().map(ProductResponse::from).toList();
    }
    @Transactional(readOnly = true)
    public ProductResponse getProduct(Long id) { return ProductResponse.from(require(productRepository, id)); }
    public void deleteProduct(Long id) { require(productRepository, id); productRepository.deleteById(id); }
    public ProductResponse createProduct(CreateProductRequest request) {
        Product value = new Product();
        value.setName(request.getName());
        value.setDescription(request.getDescription());
        value.setPrice(request.getPrice());
        value.setImageUrl(request.getImageUrl());
        value.setArType(request.getArType());
        value.setStockQuantity(request.getStockQuantity());
        value.setCategory(require(categoryRepository, request.getCategoryId()));
        value.setSeller(require(sellerRepository, request.getSellerId()));
        return ProductResponse.from(productRepository.save(value));
    }
    public ProductResponse updateProduct(Long id, UpdateProductRequest request) {
        Product value = require(productRepository, id);
        value.setName(request.getName());
        value.setDescription(request.getDescription());
        value.setPrice(request.getPrice());
        value.setImageUrl(request.getImageUrl());
        value.setArType(request.getArType());
        value.setStockQuantity(request.getStockQuantity());
        value.setCategory(require(categoryRepository, request.getCategoryId()));
        return ProductResponse.from(productRepository.save(value));
    }

    @Transactional(readOnly = true)
    public List<TryOnSessionResponse> listTryOnSession() {
        return tryOnSessionRepository.findAll().stream().map(TryOnSessionResponse::from).toList();
    }
    @Transactional(readOnly = true)
    public TryOnSessionResponse getTryOnSession(Long id) { return TryOnSessionResponse.from(require(tryOnSessionRepository, id)); }
    public void deleteTryOnSession(Long id) { require(tryOnSessionRepository, id); tryOnSessionRepository.deleteById(id); }
    public TryOnSessionResponse createTryOnSession(CreateTryOnSessionRequest request) {
        TryOnSession value = new TryOnSession();
        value.setUser(require(userRepository, request.getUserId()));
        value.setProduct(require(productRepository, request.getProductId()));
        value.setTryOnType(request.getTryOnType());
        value.setInputImageUrl(request.getInputImageUrl());
        return TryOnSessionResponse.from(tryOnSessionRepository.save(value));
    }
    public TryOnSessionResponse updateTryOnSession(Long id, UpdateTryOnResultRequest request) {
        TryOnSession value = require(tryOnSessionRepository, id);
        value.setResultImageUrl(request.getResultImageUrl());
        return TryOnSessionResponse.from(tryOnSessionRepository.save(value));
    }

    @Transactional(readOnly = true)
    public List<CartResponse> listCart() {
        return cartRepository.findAll().stream().map(CartResponse::from).toList();
    }
    @Transactional(readOnly = true)
    public CartResponse getCart(Long id) { return CartResponse.from(require(cartRepository, id)); }
    public void deleteCart(Long id) { require(cartRepository, id); cartRepository.deleteById(id); }
    public CartResponse createCart(CreateCartRequest request) {
        Cart value = new Cart();
        value.setUser(require(userRepository, request.getUserId()));
        return CartResponse.from(cartRepository.save(value));
    }

    @Transactional(readOnly = true)
    public List<OrderResponse> listOrder() {
        return orderRepository.findAll().stream().map(OrderResponse::from).toList();
    }
    @Transactional(readOnly = true)
    public OrderResponse getOrder(Long id) { return OrderResponse.from(require(orderRepository, id)); }
    public void deleteOrder(Long id) { require(orderRepository, id); orderRepository.deleteById(id); }
    public OrderResponse createOrder(CreateOrderRequest request) {
        Order value = new Order();
        value.setUser(require(userRepository, request.getUserId()));
        value.setTotalAmount(request.getTotalAmount());
        value.setOrderStatus(request.getOrderStatus());
        return OrderResponse.from(orderRepository.save(value));
    }
    public OrderResponse updateOrder(Long id, UpdateOrderStatusRequest request) {
        Order value = require(orderRepository, id);
        value.setOrderStatus(request.getOrderStatus());
        return OrderResponse.from(orderRepository.save(value));
    }
}
