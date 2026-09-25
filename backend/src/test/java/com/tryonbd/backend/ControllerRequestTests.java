package com.tryonbd.backend;

import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
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

@SpringBootTest
class ControllerRequestTests {

    @Autowired
    private WebApplicationContext context;

    private MockMvc mockMvc;

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
        mockMvc.perform(request(HttpMethod.valueOf(method), path)
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isOk())
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
    @ValueSource(strings = {"users", "sellers", "products", "categories", "try-on-sessions", "reviews", "orders"})
    void readsAndDeletesExplainPendingIntegration(String resource) throws Exception {
        mockMvc.perform(get("/api/" + resource))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("service/database integration will be implemented in the next phase")));
        mockMvc.perform(get("/api/" + resource + "/1"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("ID 1")));
        mockMvc.perform(delete("/api/" + resource + "/1"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("service/database integration will be implemented in the next phase")));
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
