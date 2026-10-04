package com.tryonbd.backend.controller;
import com.tryonbd.backend.service.PersistenceService;
import com.tryonbd.backend.response.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/account")
public class AccountController {
 private final PersistenceService service;
 public AccountController(PersistenceService service) { this.service = service; }
 public record Quantity(@NotNull @Min(0) Integer quantity) {}
 @GetMapping("/me") public UserResponse me() { return service.me(); }
 @GetMapping("/seller") public SellerResponse seller() { return service.sellerProfile(); }
 @GetMapping("/products") public java.util.List<ProductResponse> products() { return service.sellerProducts(); }
 @GetMapping("/cart") public java.util.Map<String,Integer> cart() { return service.cartItems(); }
 @PostMapping("/cart/{productId}") public java.util.Map<String,Integer> add(@PathVariable Long productId, @Valid @RequestBody Quantity request) { return service.addCartItem(productId,request.quantity()); }
 @PutMapping("/cart/{productId}") public java.util.Map<String,Integer> item(@PathVariable Long productId, @Valid @RequestBody Quantity request) { return service.setCartItem(productId, request.quantity()); }
 @PostMapping("/checkout") public OrderResponse checkout() { return service.checkout(); }
}
