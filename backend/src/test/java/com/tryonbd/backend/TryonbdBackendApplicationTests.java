package com.tryonbd.backend;
import com.tryonbd.backend.model.User;
import com.tryonbd.backend.repository.UserRepository;
import jakarta.persistence.EntityManager;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "RUN_POSTGRES_TESTS", matches = "true")
@SpringBootTest
@Transactional
class TryonbdBackendApplicationTests {
    @Autowired DataSource dataSource;
    @Autowired UserRepository users;
    @Autowired EntityManager entityManager;
    @Test void contextLoads() throws Exception {
        try (var connection = dataSource.getConnection()) {
            assertEquals("PostgreSQL", connection.getMetaData().getDatabaseProductName());
        }
        assertEquals(7, entityManager.getMetamodel().getEntities().size());
    }
    @Test void repositoryRoundTripUsesPostgreSql() {
        User user = new User();
        user.setFullName("Persistence Test");
        user.setEmail("test-" + java.util.UUID.randomUUID() + "@example.com");
        user.setPassword("test-only");
        user.setRole("CUSTOMER");
        Long id = users.saveAndFlush(user).getId();
        entityManager.clear();
        assertEquals("Persistence Test", users.findById(id).orElseThrow().getFullName());
        users.deleteById(id);
        users.flush();
        entityManager.clear();
        assertTrue(users.findById(id).isEmpty());
    }
}
