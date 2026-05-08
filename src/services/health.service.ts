type HealthResponse = {
  success: boolean;
  message: string;
};

const healthCheck = (): HealthResponse => ({
  success: true,
  message: 'API is running',
});

export { healthCheck, type HealthResponse };