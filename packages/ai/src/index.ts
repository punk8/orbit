export interface AiProviderStatus {
  enabled: boolean;
  name: string;
}

export interface MockAiProvider {
  name: "mock_provider";
  enabled: false;
}

export const disabledAiProvider: AiProviderStatus = {
  enabled: false,
  name: "disabled"
};

export const mockAiProvider: MockAiProvider = {
  enabled: false,
  name: "mock_provider"
};
