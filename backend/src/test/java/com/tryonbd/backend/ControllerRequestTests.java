package com.tryonbd.backend;

import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import com.tryonbd.backend.service.PersistenceService;
import com.tryonbd.backend.response.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.DeserializationFeature;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.containsString;

@WebMvcTest
class ControllerRequestTests {

    @Autowired
    private WebApplicationContext context;

    private MockMvc mockMvc;
    @MockitoBean private PersistenceService service;
    private final JsonMapper mapper = JsonMapper.builder()
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    static Stream<Arguments> validRequests() {
        return Stream.of(
                Arguments.of("POST", "/api/users", "{\"fullName\":\"Demo User\",\"email\":\"user@example.com\",\"password\":\"secret123\",\"phone\":\"01700000000\",\"address\":\"Dhaka\"}", "fullName", "Demo User"),
                Arguments.of("PUT", "/api/users/1", "{\"fullName\":\"Demo User\",\"email\":\"user@example.com\",\"phone\":\"01700000000\",\"address\":\"Dhaka\"}", "fullName", "Demo User"),
                Arguments.of("POST", "/api/sellers", "{\"userId\":1,\"businessName\":\"Demo Shop\",\"contactEmail\":\"shop@example.com\",\"phone\":\"01700000000\",\"subscriptionStatus\":\"active\"}", "businessName", "Demo Shop"),
                Arguments.of("PUT", "/api/sellers/1", "{\"businessName\":\"Demo Shop\",\"contactEmail\":\"shop@example.com\",\"phone\":\"01700000000\",\"subscriptionStatus\":\"active\"}", "businessName", "Demo Shop"),
                Arguments.of("POST", "/api/products", "{\"sellerId\":1,\"categoryId\":1,\"name\":\"Shirt\",\"price\":100,\"stockQuantity\":0,\"imageUrl\":\"/shirt.jpg\"}", "name", "Shirt"),
                Arguments.of("PUT", "/api/products/1", "{\"categoryId\":1,\"name\":\"Shirt\",\"price\":100,\"stockQuantity\":0,\"imageUrl\":\"/shirt.jpg\"}", "name", "Shirt"),
                Arguments.of("POST", "/api/categories", "{\"categoryName\":\"Clothing\",\"description\":\"All clothing\"}", "categoryName", "Clothing"),
                Arguments.of("PUT", "/api/categories/1", "{\"categoryName\":\"Clothing\",\"description\":\"All clothing\",\"parentCategoryId\":null}", "categoryName", "Clothing"),
                Arguments.of("POST", "/api/try-on-sessions", "{\"userId\":1,\"productId\":1,\"inputImageUrl\":\"/input.jpg\",\"tryOnType\":\"shirt\"}", "tryOnType", "shirt"),
                Arguments.of("PUT", "/api/try-on-sessions/1/result", "{\"resultImageUrl\":\"/result.jpg\"}", "resultImageUrl", "/result.jpg"),
                Arguments.of("POST", "/api/reviews", "{\"userId\":1,\"productId\":1,\"rating\":1,\"comment\":\"Review text\"}", "comment", "Review text"),
                Arguments.of("PUT", "/api/reviews/1", "{\"rating\":5,\"comment\":\"Review text\"}", "comment", "Review text"),
                Arguments.of("POST", "/api/orders", "{\"userId\":1,\"totalAmount\":0,\"orderStatus\":\"pending\"}", "orderStatus", "pending"),
                Arguments.of("PUT", "/api/orders/1/status", "{\"orderStatus\":\"confirmed\"}", "orderStatus", "confirmed")
        );
    }

    @ParameterizedTest
    @MethodSource("validRequests")
    void validRequestsAreBoundAndReturned(String method, String path, String json,
            String responseField, String expectedValue) throws Exception {
        String responseJson = "{\"id\":1," + json.substring(1);
        switch (path.split("/")[2]) {
            case "users" -> {
                var response = mapper.readValue(responseJson, UserResponse.class);
                when(service.createUser(any())).thenReturn(response);
                when(service.updateUser(any(), any())).thenReturn(response);
            }
            case "sellers" -> {
                var response = mapper.readValue(responseJson, SellerResponse.class);
                when(service.createSeller(any())).thenReturn(response);
                when(service.updateSeller(any(), any())).thenReturn(response);
            }
            case "products" -> {
                var response = mapper.readValue(responseJson, ProductResponse.class);
                when(service.createProduct(any())).thenReturn(response);
                when(service.updateProduct(any(), any())).thenReturn(response);
            }
            case "categories" -> {
                var response = mapper.readValue(responseJson, CategoryResponse.class);
                when(service.createCategory(any())).thenReturn(response);
                when(service.updateCategory(any(), any())).thenReturn(response);
            }
            case "try-on-sessions" -> {
                var response = mapper.readValue(responseJson, TryOnSessionResponse.class);
                when(service.createTryOnSession(any())).thenReturn(response);
                when(service.updateTryOnSession(any(), any())).thenReturn(response);
            }
            case "orders" -> {
                var response = mapper.readValue(responseJson, OrderResponse.class);
                when(service.createOrder(any())).thenReturn(response);
                when(service.updateOrder(any(), any())).thenReturn(response);
            }
        }
        mockMvc.perform(request(HttpMethod.valueOf(method), path)
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().is(method.equals("POST") && !path.contains("/reviews") ? 201 : 200))
                .andExpect(jsonPath("$." + responseField).value(expectedValue))
                .andExpect(jsonPath("$.password").doesNotExist());
    }

    @ParameterizedTest
    @MethodSource("validRequests")
    void missingRequiredFieldsAreRejected(String method, String path, String json,
            String responseField, String expectedValue) throws Exception {
        mockMvc.perform(request(HttpMethod.valueOf(method), path)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @ValueSource(strings = {"users", "sellers", "products", "categories", "try-on-sessions", "orders", "carts"})
    void readsReturnJsonArrays(String resource) throws Exception {
        mockMvc.perform(get("/api/" + resource))
            .andExpect(status().isOk()).andExpect(content().json("[]"));
    }

    @org.junit.jupiter.api.Test
    void missingRecordReturns404() throws Exception {
        when(service.getProduct(999L)).thenThrow(new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.NOT_FOUND, "Record not found"));
        mockMvc.perform(get("/api/products/999")).andExpect(status().isNotFound());
        verify(service).getProduct(999L);
    }

    @org.junit.jupiter.api.Test
    void deletionDelegatesAndReturnsNoContent() throws Exception {
        mockMvc.perform(delete("/api/products/1")).andExpect(status().isNoContent());
        verify(service).deleteProduct(1L);
    }

    @org.junit.jupiter.api.Test
    void cartCreationDelegatesToService() throws Exception {
        when(service.createCart(any())).thenReturn(new CartResponse(1L, 1L, null, null));
        mockMvc.perform(post("/api/carts").contentType(MediaType.APPLICATION_JSON).content("{\"userId\":1}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.userId").value(1));
        verify(service).createCart(any());
        mockMvc.perform(post("/api/carts").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
    }

    static Stream<Arguments> invalidRequests() {
        return Stream.of(
                Arguments.of("/api/users", "{\"fullName\":\"Demo User\",\"email\":\"invalid\",\"password\":\"secret123\",\"phone\":\"01700000000\",\"address\":\"Dhaka\"}"),
                Arguments.of("/api/users", "{\"fullName\":\"Demo User\",\"email\":\"user@example.com\",\"password\":\"12345\",\"phone\":\"01700000000\",\"address\":\"Dhaka\"}"),
                Arguments.of("/api/categories", "{\"categoryName\":\"   \",\"description\":\"All clothing\"}"),
                Arguments.of("/api/products", "{\"sellerId\":1,\"categoryId\":1,\"name\":\"Shirt\",\"price\":0,\"stockQuantity\":0,\"imageUrl\":\"/shirt.jpg\"}"),
                Arguments.of("/api/products", "{\"sellerId\":1,\"categoryId\":1,\"name\":\"Shirt\",\"price\":100,\"stockQuantity\":-1,\"imageUrl\":\"/shirt.jpg\"}"),
                Arguments.of("/api/reviews", "{\"userId\":1,\"productId\":1,\"rating\":0,\"comment\":\"Review text\"}"),
                Arguments.of("/api/reviews", "{\"userId\":1,\"productId\":1,\"rating\":6,\"comment\":\"Review text\"}"),
                Arguments.of("/api/orders", "{\"userId\":1,\"totalAmount\":-1,\"orderStatus\":\"pending\"}")
        );
    }

    @ParameterizedTest
    @MethodSource("invalidRequests")
    void invalidFieldValuesAreRejected(String path, String json) throws Exception {
        mockMvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest());
    }
}
